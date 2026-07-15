"""FastAPI router — WRAG upload, markdown management, and SAG proxy."""

from __future__ import annotations

import os
import tempfile
import asyncio
from pathlib import Path
from typing import Callable

from fastapi import APIRouter, Request, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import PlainTextResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel

from .config import settings
from .converter import convert_to_markdown
from .models import (
    UploadResult,
    UploadJobResult,
    MdFileInfo,
    MdFileListResponse,
    MdFileContentResponse,
    UpdateContentRequest,
    UpdateContentResponse,
    ImportRequest,
    ImportResponse,
    DeleteResponse,
    FormatsResponse,
)
from .md_store import MdStore
from .sag_client import SagClient

router = APIRouter()

# ---------------------------------------------------------------------------
# Dependencies (injected by main.py at startup)
# ---------------------------------------------------------------------------

_md_store: MdStore | None = None
_sag_client: SagClient | None = None
_restart_mcp_fn: Callable[[str], bool] | None = None


def get_md_store() -> MdStore:
    assert _md_store is not None, "MdStore not initialized"
    return _md_store


def get_sag_client() -> SagClient:
    assert _sag_client is not None, "SagClient not initialized"
    return _sag_client


def init_router(md_store: MdStore, sag_client: SagClient, restart_mcp_fn: Callable[[str], bool] | None = None) -> None:
    global _md_store, _sag_client, _restart_mcp_fn
    _md_store = md_store
    _sag_client = sag_client
    _restart_mcp_fn = restart_mcp_fn


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@router.get("/health")
async def health():
    sag_healthy = False
    sag_client = get_sag_client()
    try:
        resp = await sag_client.client.get(f"{sag_client.base_url}/health", timeout=5.0)
        sag_healthy = resp.status_code == 200
    except Exception:
        pass
    return {
        "status": "ok",
        "sag_connected": sag_healthy,
        "sag_url": settings.sag_api_url,
    }


# ---------------------------------------------------------------------------
# Formats
# ---------------------------------------------------------------------------

@router.get("/api/formats", response_model=FormatsResponse)
async def list_formats():
    return FormatsResponse(
        formats=settings.supported_formats,
        max_upload_size_mb=settings.max_upload_size_mb,
    )


# ---------------------------------------------------------------------------
# File upload
# ---------------------------------------------------------------------------

@router.post("/api/wrag/upload")
async def upload_file(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    title: str | None = Form(None),
    chunking_mode: str | None = Form(None),
    save_markdown: bool = Form(True),
):
    """Upload any supported file → convert to md → ingest into SAG."""
    # Validate format
    original_filename = file.filename or "unknown"
    ext = Path(original_filename).suffix.lower()
    if ext not in settings.supported_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Supported: {', '.join(settings.supported_formats)}",
        )

    # Check size if limit configured
    if settings.max_upload_size_mb is not None:
        max_bytes = settings.max_upload_size_mb * 1024 * 1024
        content = await file.read()
        file.file.seek(0)
        if len(content) > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed: {settings.max_upload_size_mb} MB",
            )

    # Save uploaded file to temp
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        while chunk := await file.read(4 * 1024 * 1024):
            tmp.write(chunk)

    original_size = os.path.getsize(tmp_path)
    doc_title = title or Path(original_filename).stem

    try:
        # Step 1: Convert
        loop = asyncio.get_event_loop()
        markdown_content = await loop.run_in_executor(
            None, convert_to_markdown, tmp_path
        )

        # Step 2: Save markdown (optional)
        md_store = get_md_store()
        file_id = None
        if save_markdown:
            record = await md_store.save(
                markdown_content=markdown_content,
                original_filename=original_filename,
                original_format=ext,
                original_size=original_size,
            )
            file_id = record["id"]

        # Step 3: Ingest into SAG
        sag = get_sag_client()
        result = await sag.upload_document(
            project_id=project_id,
            title=doc_title,
            content=markdown_content,
            file_name=f"{doc_title}.md",
        )

        # Step 4: Record import
        if file_id and save_markdown:
            project_name = "unknown"  # could fetch from SAG projects API if needed
            await md_store.record_import(
                file_id=file_id,
                project_id=project_id,
                project_name=project_name,
                document_id=result.get("documentId", ""),
            )

        return UploadResult(
            file_id=file_id,
            document_id=result.get("documentId", ""),
            project_id=project_id,
            original_filename=original_filename,
            original_format=ext,
            md_size_bytes=len(markdown_content.encode("utf-8")),
            chunk_count=result.get("chunkCount", 0),
            event_count=result.get("eventCount", 0),
            markdown_saved=save_markdown,
        )

    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@router.post("/api/wrag/upload/stream")
async def upload_file_stream(
    request: Request,
    file: UploadFile = File(...),
    project_id: str = Form(...),
    title: str | None = Form(None),
    save_markdown: bool = Form(True),
):
    """Upload with SSE progress streaming."""
    original_filename = file.filename or "unknown"
    ext = Path(original_filename).suffix.lower()

    if ext not in settings.supported_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'.",
        )

    if settings.max_upload_size_mb is not None:
        max_bytes = settings.max_upload_size_mb * 1024 * 1024
        content = await file.read()
        file.file.seek(0)
        if len(content) > max_bytes:
            raise HTTPException(status_code=413, detail="File too large.")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp_path = tmp.name
        while chunk := await file.read(4 * 1024 * 1024):
            tmp.write(chunk)

    original_size = os.path.getsize(tmp_path)
    doc_title = title or Path(original_filename).stem

    async def event_stream():
        def _send(event: str, data: str = "{}") -> str:
            return f"event: {event}\ndata: {data}\n\n"

        try:
            # Step 1: converting
            yield _send("converting", '{"stage":"converting"}')
            loop = asyncio.get_event_loop()
            markdown_content = await loop.run_in_executor(
                None, convert_to_markdown, tmp_path
            )
            yield _send("converted", f'{{"stage":"converted","size":{len(markdown_content.encode("utf-8"))}}}')

            # Step 2: saving_md
            if save_markdown:
                yield _send("saving_md", '{"stage":"saving_md"}')
                md_store = get_md_store()
                record = await md_store.save(
                    markdown_content=markdown_content,
                    original_filename=original_filename,
                    original_format=ext,
                    original_size=original_size,
                )
                file_id = record["id"]
                yield _send("md_saved", f'{{"stage":"md_saved","file_id":"{file_id}"}}')
            else:
                file_id = None

            # Step 3: ingesting — use async upload job with polling
            yield _send("ingesting", '{"stage":"ingesting"}')
            sag = get_sag_client()
            import json as _json

            # Create async upload job (non-blocking)
            job = await sag.create_upload_job(
                project_id=project_id,
                title=doc_title,
                content=markdown_content,
                file_name=f"{doc_title}.md",
            )
            job_id = job["id"]

            result = {}
            while True:
                # Check for client disconnect (cancel button)
                if await request.is_disconnected():
                    # Job continues in SAG; we just stop streaming
                    return

                job_status = await sag.get_upload_job(job_id)
                status = job_status.get("status", "")

                yield _send("job_progress", _json.dumps({
                    "job_id": job_id,
                    "status": status,
                    "stage": job_status.get("stage", ""),
                    "progress": job_status.get("progress", 0),
                    "message": job_status.get("message", ""),
                    "chunkCount": job_status.get("chunkCount", 0),
                    "eventCount": job_status.get("eventCount", 0),
                }))

                if status == "COMPLETED":
                    result = {"documentId": job_status.get("documentId", "")}
                    break
                elif status == "FAILED":
                    raise Exception(job_status.get("error") or job_status.get("message") or "Upload job failed")

                await asyncio.sleep(2)

            yield _send("ingested", _json.dumps({"stage": "ingested", "document_id": result.get("documentId", "")}))

            # Record import
            if file_id and save_markdown:
                await get_md_store().record_import(
                    file_id=file_id,
                    project_id=project_id,
                    project_name="unknown",
                    document_id=result.get("documentId", ""),
                )

            yield _send("done", _json.dumps({"stage": "done", "file_id": file_id or "", "document_id": result.get("documentId", "")}))

        except Exception as e:
            yield _send("error", _json.dumps({"stage": "error", "message": str(e)}))
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Markdown file management
# ---------------------------------------------------------------------------

@router.get("/api/wrag/markdown", response_model=MdFileListResponse)
async def list_md_files():
    """List all saved markdown files."""
    md_store = get_md_store()
    files = await md_store.list_all()
    return MdFileListResponse(files=files)


@router.get("/api/wrag/markdown/{file_id}")
async def get_md_file(file_id: str):
    """Get file metadata with import history."""
    md_store = get_md_store()
    record = await md_store.get(file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Markdown file not found")
    return record


@router.get("/api/wrag/markdown/{file_id}/content")
async def get_md_file_content(file_id: str):
    """Get raw markdown content for preview or editing."""
    md_store = get_md_store()
    content = await md_store.get_content(file_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Markdown file not found")
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")


@router.get("/api/wrag/markdown/{file_id}/download")
async def download_md_file(file_id: str):
    """Download the .md file."""
    md_store = get_md_store()
    content = await md_store.get_content(file_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Markdown file not found")
    record = await md_store.get(file_id)
    download_name = f"{Path(record['original_filename']).stem}.md"
    return PlainTextResponse(
        content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


@router.patch("/api/wrag/markdown/{file_id}/content")
async def update_md_file_content(file_id: str, body: UpdateContentRequest):
    """Edit markdown content online (cache only — does NOT sync to KB)."""
    md_store = get_md_store()
    result = await md_store.update_content(file_id, body.content)
    if result is None:
        raise HTTPException(status_code=404, detail="Markdown file not found")
    return UpdateContentResponse(**result)


@router.delete("/api/wrag/markdown/{file_id}")
async def delete_md_file(file_id: str):
    """Delete saved markdown file (does NOT affect SAG KB documents)."""
    md_store = get_md_store()
    deleted = await md_store.delete(file_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Markdown file not found")
    return DeleteResponse(deleted=True)


@router.post("/api/wrag/markdown/{file_id}/import")
async def import_md_file(file_id: str, body: ImportRequest):
    """Import a saved markdown file into a SAG project."""
    md_store = get_md_store()
    record = await md_store.get(file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Markdown file not found")

    content = await md_store.get_content(file_id)
    if content is None:
        raise HTTPException(status_code=500, detail="Failed to read markdown content")

    doc_title = body.title or Path(record["original_filename"]).stem

    # Check for existing import (prevent duplicate SAG ingestion)
    existing_imports = await md_store.get_imports(file_id)
    for imp in existing_imports:
        if imp["project_id"] == body.project_id:
            raise HTTPException(
                status_code=409,
                detail=f"File already imported into project '{body.project_id}'. "
                       "Delete the document from SAG first to re-import.",
            )

    sag = get_sag_client()
    try:
        result = await sag.upload_document(
            project_id=body.project_id,
            title=doc_title,
            content=content,
            file_name=f"{doc_title}.md",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"SAG ingestion failed: {e}")

    await md_store.record_import(
        file_id=file_id,
        project_id=body.project_id,
        project_name="unknown",
        document_id=result.get("documentId", ""),
    )

    return ImportResponse(
        document_id=result.get("documentId", ""),
        project_id=body.project_id,
    )


# ---------------------------------------------------------------------------
# MCP project binding
# ---------------------------------------------------------------------------

class McpBindRequest(BaseModel):
    project_id: str


@router.get("/api/wrag/mcp/binding")
async def get_mcp_binding():
    """Get the current MCP bridge project binding."""
    return JSONResponse({
        "project_id": settings.mcp_source_id,
        "mcp_enabled": settings.mcp_source_id is not None,
    })


@router.post("/api/wrag/mcp/bind")
async def bind_mcp_project(body: McpBindRequest):
    """Switch the MCP bridge to bind to a different project.

    Restarts the MCP HTTP bridge subprocess with the new project ID.
    Active MCP sessions will be terminated.
    """
    if _restart_mcp_fn is None:
        raise HTTPException(500, "MCP bridge management not available")

    project_id = body.project_id.strip()
    if not project_id:
        raise HTTPException(400, "project_id is required")

    success = _restart_mcp_fn(project_id)
    if not success:
        raise HTTPException(500, "Failed to restart MCP bridge")

    return JSONResponse({
        "project_id": settings.mcp_source_id,
        "message": "MCP bridge restarted with new project binding",
    })


# ---------------------------------------------------------------------------
# SAG proxy — catch-all, must be registered LAST
# ---------------------------------------------------------------------------

@router.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_sag_api(request: Request, path: str):
    """Transparent proxy for all SAG API endpoints."""
    sag = get_sag_client()
    return await sag.proxy(request)
