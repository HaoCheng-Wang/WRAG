"""Pydantic data models for WRAG API requests and responses."""

from pydantic import BaseModel, Field


# --- Upload ---

class UploadResult(BaseModel):
    file_id: str | None = None
    document_id: str
    project_id: str
    original_filename: str
    original_format: str
    md_size_bytes: int
    chunk_count: int
    event_count: int
    markdown_saved: bool


class UploadJobResult(BaseModel):
    job_id: str
    status: str
    progress: str  # "converting" | "saving_md" | "ingesting" | "done" | "error"
    result: UploadResult | None = None
    error: str | None = None


# --- Markdown file management ---

class ImportRecord(BaseModel):
    project_id: str
    project_name: str | None = None
    document_id: str
    imported_at: str


class MdFileInfo(BaseModel):
    id: str
    original_filename: str
    original_format: str
    md_filename: str
    md_size_bytes: int
    original_size_bytes: int | None = None
    created_at: str
    updated_at: str | None = None
    import_count: int = 0
    imports: list[ImportRecord] = []


class MdFileListResponse(BaseModel):
    files: list[MdFileInfo]


class MdFileContentResponse(BaseModel):
    id: str
    content: str


class UpdateContentRequest(BaseModel):
    content: str


class UpdateContentResponse(BaseModel):
    id: str
    md_size_bytes: int
    updated_at: str


class ImportRequest(BaseModel):
    project_id: str
    title: str | None = None


class ImportResponse(BaseModel):
    document_id: str
    project_id: str


class DeleteResponse(BaseModel):
    deleted: bool


# --- Formats ---

class FormatsResponse(BaseModel):
    formats: list[str]
    max_upload_size_mb: int | None = None
