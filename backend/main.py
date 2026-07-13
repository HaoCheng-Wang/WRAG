"""WRAG FastAPI application — entry point.

Orchestrates the full stack lifecycle:
1. Verify PostgreSQL is reachable
2. Set up SAG database (migrations + seed)
3. Start SAG Fastify API as a subprocess
4. Initialize Markdown storage (SQLite)
5. Start FastAPI on port 8000
6. On shutdown, gracefully terminate SAG subprocess
"""

from __future__ import annotations

import os
import sys
import signal
import asyncio
import subprocess
import time
import urllib.request
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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

    # Prepare environment (inherit current + .env)
    env = os.environ.copy()
    env["HTTP_HOST"] = "127.0.0.1"
    env["HTTP_PORT"] = "4173"
    env["NODE_ENV"] = env.get("NODE_ENV", "development")
    env["LOG_LEVEL"] = env.get("LOG_LEVEL", "info")

    # Pass database URL if set
    if settings.database_url:
        env["DATABASE_URL"] = settings.database_url

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


def _health_poll_sag(max_retries: int = 60, interval: float = 2.0) -> bool:
    """Poll SAG /health until it responds 200.

    Returns True if SAG becomes healthy, False otherwise.
    """
    url = f"{settings.sag_api_url}/health"
    print(f"[WRAG] Waiting for SAG to become healthy at {url}...")
    for i in range(max_retries):
        try:
            resp = urllib.request.urlopen(url, timeout=3.0)
            if resp.status == 200:
                print("[WRAG] SAG is healthy!")
                return True
        except Exception:
            pass
        print(f"[WRAG]   Attempt {i+1}/{max_retries} — SAG not ready, retrying in {interval}s...")
        time.sleep(interval)
    print("[WRAG] WARNING: SAG did not become healthy within timeout.")
    return False


def _setup_sag_database():
    """Run SAG migrations and seed data."""
    sag_dir = _resolve_sag_dir()
    print("[WRAG] Setting up SAG database (migrate + seed)...")
    env = os.environ.copy()
    if settings.database_url:
        env["DATABASE_URL"] = settings.database_url
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

    return app


app = create_app()


# ---------------------------------------------------------------------------
# Lifecycle events
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    global _sag_process, _sag_client

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
        urllib.request.urlopen(f"{settings.sag_api_url}/health", timeout=2.0)
        sag_already_running = True
        print(f"[WRAG] SAG is already running at {settings.sag_api_url}")
    except Exception:
        pass

    # 3. Start SAG if needed
    if not sag_already_running:
        _setup_sag_database()
        _sag_process = _start_sag()
        _health_poll_sag()

    # 4. Create SagClient
    _sag_client = SagClient(settings.sag_api_url)

    # 5. Wire up router dependencies
    init_router(md_store, _sag_client)

    print("[WRAG] ========================================")
    print(f"[WRAG]  WRAG ready at http://{settings.wrag_host}:{settings.wrag_port}")
    print("[WRAG] ========================================")


@app.on_event("shutdown")
async def shutdown():
    print("[WRAG] Shutting down...")
    if _sag_client:
        await _sag_client.close()
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
