"""WRAG configuration — loaded from environment variables."""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- WRAG server ---
    wrag_host: str = "0.0.0.0"
    wrag_port: int = 8000

    # --- Paths ---
    sag_api_url: str = "http://127.0.0.1:4173"
    sag_dir: Path = Path("./SAG")
    markitdown_dir: Path = Path("./markitdown")
    md_storage_dir: Path = Path("md_storage")

    # --- Upload limits (None = no limit) ---
    max_upload_size_mb: int | None = None

    # --- Supported file formats (all markitdown-capable formats) ---
    supported_formats: list[str] = [
        ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv",
        ".html", ".htm", ".epub", ".md", ".txt", ".json",
        ".xml", ".jpg", ".jpeg", ".png", ".gif", ".bmp",
        ".mp3", ".wav", ".ogg", ".zip", ".ipynb", ".msg",
        ".rtf",
    ]

    # --- Database (passed through to SAG) ---
    database_url: str = "postgres://sag_lite:sag_lite_pass@localhost:5432/sag_lite"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "allow"}


settings = Settings()
