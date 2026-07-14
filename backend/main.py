"""WRAG FastAPI application — entry point.

Orchestrates the full stack lifecycle:
1. Verify PostgreSQL is reachable
2. Set up SAG database (migrations + seed)
3. Start SAG Fastify API as a subprocess
4. Initialize Markdown storage (SQLite)
5. Start FastAPI on port 8555
6. On shutdown, gracefully terminate SAG subprocess
"""

from __future__ import annotations

import os
import sys
import signal
import asyncio
import subprocess
import urllib.request
from pathlib import Path

import mimetypes
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Ensure the backend package is importable
_HERE = Path(__file__).resolve().parent
if str(_HERE.parent) not in sys.path:
    sys.path.insert(0, str(_HERE.parent))

from backend.config import settings
from backend.md_store import MdStore
from backend.sag_client import SagClient
from backend.router import router, init_router

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------

_sag_process: subprocess.Popen | None = None
_sag_client: SagClient | None = None
_shutdown_event: asyncio.Event | None = None
_mcp_process: subprocess.Popen | None = None


# ---------------------------------------------------------------------------
# SAG lifecycle helpers
# ---------------------------------------------------------------------------

def _resolve_sag_dir() -> Path:
    """Resolve the absolute path to the SAG project directory."""
    sag_dir = Path(settings.sag_dir)
    if not sag_dir.is_absolute():
        # Relative to WRAG/ directory
        sag_dir = (_HERE.parent / sag_dir).resolve()
    return sag_dir


def _start_sag() -> subprocess.Popen:
    """Start SAG API as a subprocess via `npm run dev:api`."""
    sag_dir = _resolve_sag_dir()

    if not sag_dir.is_dir():
        raise RuntimeError(f"SAG directory not found: {sag_dir}")

    # Check if node_modules exist
    node_modules = sag_dir / "node_modules"
    if not node_modules.is_dir():
        print("[WRAG] Installing SAG dependencies...")
        subprocess.run(
            ["npm", "install"],
            cwd=str(sag_dir),
            check=True,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )
        print("[WRAG] SAG dependencies installed.")

    # Inherit current environment — SAG reads its own .env via dotenv.
    # We do NOT override HTTP_HOST / HTTP_PORT or DATABASE_URL here.
    # Previously DATABASE_URL was injected, but that was redundant:
    # SAG already reads it from SAG/.env.
    env = os.environ.copy()

    print(f"[WRAG] Starting SAG API (npm run dev:api) in {sag_dir}...")
    proc = subprocess.Popen(
        ["npm", "run", "dev:api"],
        cwd=str(sag_dir),
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr,
        # Create a new process group so we can signal the whole tree
        preexec_fn=os.setsid if sys.platform != "win32" else None,
    )
    return proc


def _stop_sag():
    """Gracefully terminate the SAG subprocess."""
    global _sag_process
    if _sag_process is None:
        return
    print("[WRAG] Stopping SAG...")
    try:
        if sys.platform == "win32":
            _sag_process.terminate()
        else:
            # Kill the entire process group
            os.killpg(os.getpgid(_sag_process.pid), signal.SIGTERM)
        _sag_process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        print("[WRAG] SAG did not exit, force-killing...")
        if sys.platform == "win32":
            _sag_process.kill()
        else:
            os.killpg(os.getpgid(_sag_process.pid), signal.SIGKILL)
        _sag_process.wait()
    except Exception as e:
        print(f"[WRAG] Error stopping SAG: {e}")
    _sag_process = None
    print("[WRAG] SAG stopped.")


def _start_mcp_http_server() -> subprocess.Popen | None:
    """Start the MCP HTTP bridge as a subprocess, running from SAG directory."""
    sag_dir = _resolve_sag_dir()
    mcp_script = _HERE / "mcp-http-server.ts"

    if not mcp_script.is_file():
        print("[WRAG] MCP HTTP bridge script not found, skipping.")
        return None

    env = os.environ.copy()
    env["SAG_MCP_SOURCE_ID"] = settings.mcp_source_id  # type: ignore[arg-type]
    env["MCP_HTTP_PORT"] = "4174"
    env["MCP_HOST"] = "0.0.0.0"

    print(f"[WRAG] Starting MCP HTTP bridge on port 4174 (source_id: {settings.mcp_source_id})...")
    proc = subprocess.Popen(
        ["node", "--import", "tsx/esm", str(mcp_script)],
        cwd=str(sag_dir),  # Must run from SAG dir — imports resolve through SAG's node_modules
        env=env,
        stdout=sys.stdout,
        stderr=sys.stderr,
        preexec_fn=os.setsid if sys.platform != "win32" else None,
    )
    return proc


def _stop_mcp():
    """Gracefully terminate the MCP HTTP bridge."""
    global _mcp_process
    if _mcp_process is None:
        return
    print("[WRAG] Stopping MCP HTTP bridge...")
    try:
        if sys.platform == "win32":
            _mcp_process.terminate()
        else:
            os.killpg(os.getpgid(_mcp_process.pid), signal.SIGTERM)
        _mcp_process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        print("[WRAG] MCP bridge did not exit, force-killing...")
        if sys.platform == "win32":
            _mcp_process.kill()
        else:
            os.killpg(os.getpgid(_mcp_process.pid), signal.SIGKILL)
        _mcp_process.wait()
    except Exception as e:
        print(f"[WRAG] Error stopping MCP bridge: {e}")
    _mcp_process = None
    print("[WRAG] MCP HTTP bridge stopped.")


def _restart_mcp(new_source_id: str) -> bool:
    """Restart MCP bridge bound to a different project.

    Stops the current bridge (if any), updates settings.mcp_source_id,
    and starts a new one. Returns True on success.
    """
    global _mcp_process
    _stop_mcp()
    settings.mcp_source_id = new_source_id  # type: ignore[assignment]
    _mcp_process = _start_mcp_http_server()
    if _mcp_process is not None:
        print(f"[WRAG] MCP HTTP bridge restarted — now bound to project: {new_source_id}")
        return True
    print("[WRAG] Failed to restart MCP HTTP bridge")
    return False


async def _health_poll_sag(max_retries: int = 60, interval: float = 2.0) -> bool:
    """Poll SAG /health until it responds 200 (async, cancellable).

    Returns True if SAG becomes healthy, False otherwise.
    Checks _shutdown_event between retries so Ctrl+C always works.
    """
    url = f"{settings.sag_api_url}/health"
    print(f"[WRAG] Waiting for SAG to become healthy at {url}...")
    for i in range(max_retries):
        # Check for shutdown signal before every attempt
        if _shutdown_event and _shutdown_event.is_set():
            print("[WRAG] Shutdown requested — aborting SAG health poll.")
            return False

        try:
            # Run the blocking HTTP call in a thread so the event loop stays free
            resp = await asyncio.to_thread(
                urllib.request.urlopen, url, None, 3.0
            )
            if resp.status == 200:
                print("[WRAG] SAG is healthy!")
                return True
        except Exception:
            pass

        print(f"[WRAG]   Attempt {i+1}/{max_retries} — SAG not ready, retrying in {interval}s...")

        # asyncio.sleep yields the event loop — Ctrl+C (SIGINT) can be handled
        try:
            await asyncio.wait_for(
                _shutdown_event.wait() if _shutdown_event else asyncio.sleep(interval),
                timeout=interval,
            )
        except asyncio.TimeoutError:
            pass  # Normal — just a sleep interval

        if _shutdown_event and _shutdown_event.is_set():
            print("[WRAG] Shutdown requested — aborting SAG health poll.")
            return False

    print("[WRAG] WARNING: SAG did not become healthy within timeout.")
    return False


def _setup_sag_database():
    """Run SAG migrations and seed data."""
    sag_dir = _resolve_sag_dir()
    print("[WRAG] Setting up SAG database (migrate + seed)...")
    # SAG reads its own .env — no need to inject DATABASE_URL
    env = os.environ.copy()
    subprocess.run(
        ["npm", "run", "db:setup"],
        cwd=str(sag_dir),
        env=env,
        check=False,  # Don't crash if already set up
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    print("[WRAG] SAG database setup complete.")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    app = FastAPI(
        title="WRAG",
        description="Multi-format RAG Knowledge Base — powered by MarkItDown + SAG",
        version="0.1.0",
    )

    # CORS — allow frontend dev server
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5174", "http://127.0.0.1:5174", "*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)

    # Serve built frontend static files (for Docker/production mode)
    # The frontend/dist/ directory is created by `npm run build` in the frontend/
    frontend_dist = _HERE.parent / "frontend" / "dist"
    if frontend_dist.is_dir() and (frontend_dist / "index.html").exists():
        # Mount static assets (JS, CSS, images, etc.)
        app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="frontend_assets")

        # Catch-all for SPA client-side routes: serve index.html for any non-API request
        @app.exception_handler(404)
        async def spa_fallback(request, exc):
            if request.url.path.startswith("/api/") or request.url.path == "/health":
                # Let the original 404 pass through for API routes
                from fastapi.responses import JSONResponse
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            index_path = frontend_dist / "index.html"
            if index_path.exists():
                return FileResponse(str(index_path), media_type="text/html")
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        print(f"[WRAG] Serving frontend from {frontend_dist}")

    return app


app = create_app()


# ---------------------------------------------------------------------------
# Lifecycle events
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    global _sag_process, _sag_client, _shutdown_event

    _shutdown_event = asyncio.Event()

    print("[WRAG] ========================================")
    print("[WRAG]  WRAG starting up...")
    print("[WRAG] ========================================")

    # 1. Initialize MdStore
    md_storage_dir = _HERE.parent / settings.md_storage_dir
    md_storage_dir.mkdir(parents=True, exist_ok=True)
    md_store = MdStore(md_storage_dir)
    await md_store.initialize()
    print(f"[WRAG] Markdown storage initialized at {md_storage_dir}")

    # 2. Check if SAG is already running
    sag_already_running = False
    try:
        resp = await asyncio.to_thread(
            urllib.request.urlopen, f"{settings.sag_api_url}/health", None, 2.0
        )
        sag_already_running = resp.status == 200
        if sag_already_running:
            print(f"[WRAG] SAG is already running at {settings.sag_api_url}")
    except Exception:
        pass

    # 3. Start SAG if needed
    if not sag_already_running:
        _setup_sag_database()
        _sag_process = _start_sag()
        await _health_poll_sag()

    # 4. Start MCP HTTP bridge — auto-discover project if not configured
    if not settings.mcp_source_id:
        try:
            import json as _json
            sag_projects_url = f"{settings.sag_api_url}/api/projects"
            resp = await asyncio.to_thread(urllib.request.urlopen, sag_projects_url, None, 5.0)
            projects_data = _json.loads(resp.read().decode())
            first_project = (projects_data.get("projects") or [None])[0]
            if first_project:
                settings.mcp_source_id = first_project["id"]
                print(f"[WRAG] Auto-configured MCP source_id from first project: {first_project.get('name', settings.mcp_source_id)}")
            else:
                print("[WRAG] No projects found in SAG — MCP bridge will not start. Create a project and restart.")
        except Exception as e:
            print(f"[WRAG] Could not auto-discover project for MCP bridge: {e}")

    if settings.mcp_source_id:
        _mcp_process = _start_mcp_http_server()
        print(f"[WRAG] MCP HTTP bridge started on port 4174 (source_id: {settings.mcp_source_id})")
    else:
        print("[WRAG] MCP HTTP bridge not started — no project available. Create a project first, then restart.")

    # 5. Create SagClient
    _sag_client = SagClient(settings.sag_api_url)

    # 5. Wire up router dependencies
    init_router(md_store, _sag_client, _restart_mcp)

    print("[WRAG] ========================================")
    print(f"[WRAG]  WRAG ready at http://{settings.wrag_host}:{settings.wrag_port}")
    print("[WRAG] ========================================")


@app.on_event("shutdown")
async def shutdown():
    global _shutdown_event
    print("[WRAG] Shutting down...")

    # Signal the health poll to abort immediately
    if _shutdown_event:
        _shutdown_event.set()

    if _sag_client:
        await _sag_client.close()
    _stop_mcp()
    _stop_sag()
    print("[WRAG] Shutdown complete.")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.wrag_host,
        port=settings.wrag_port,
        reload=False,
        log_level="info",
    )
