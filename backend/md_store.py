"""Markdown file storage and metadata management.

Uses SQLite for metadata tracking and filesystem for .md content.
Markdown files and SAG knowledge-base documents are INDEPENDENTLY managed:
- Deleting a markdown file does NOT affect KB documents.
- Deleting a KB document does NOT affect the saved markdown.
"""

from __future__ import annotations

import uuid
import aiosqlite
import aiofiles
import aiofiles.os as aio_os
from datetime import datetime, timezone
from pathlib import Path


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS md_files (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    original_format TEXT NOT NULL,
    md_filename TEXT NOT NULL,
    md_size_bytes INTEGER NOT NULL,
    original_size_bytes INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    import_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS md_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    md_file_id TEXT NOT NULL REFERENCES md_files(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    project_name TEXT,
    document_id TEXT,
    imported_at TEXT NOT NULL,
    UNIQUE(md_file_id, project_id)
);
"""


class MdStore:
    """Manages persisted markdown files and their metadata."""

    def __init__(self, storage_dir: Path) -> None:
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.storage_dir / "metadata.db"

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """Create tables and indexes if they don't exist."""
        async with aiosqlite.connect(str(self.db_path)) as db:
            await db.executescript(SCHEMA_SQL)
            await db.commit()

    # ------------------------------------------------------------------
    # File CRUD
    # ------------------------------------------------------------------

    async def save(
        self,
        markdown_content: str,
        original_filename: str,
        original_format: str,
        original_size: int,
    ) -> dict:
        """Persist markdown text to filesystem + record metadata.

        Returns a dict representation of the new record.
        """
        file_id = str(uuid.uuid4())
        md_filename = f"{file_id}.md"
        md_path = self.storage_dir / md_filename
        md_size = len(markdown_content.encode("utf-8"))
        now = datetime.now(timezone.utc).isoformat()

        async with aiofiles.open(md_path, "w", encoding="utf-8") as f:
            await f.write(markdown_content)

        async with aiosqlite.connect(str(self.db_path)) as db:
            await db.execute(
                """INSERT INTO md_files
                   (id, original_filename, original_format, md_filename,
                    md_size_bytes, original_size_bytes, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (file_id, original_filename, original_format, md_filename,
                 md_size, original_size, now),
            )
            await db.commit()

        return {
            "id": file_id,
            "original_filename": original_filename,
            "original_format": original_format,
            "md_filename": md_filename,
            "md_size_bytes": md_size,
            "original_size_bytes": original_size,
            "created_at": now,
            "updated_at": None,
            "import_count": 0,
            "imports": [],
        }

    async def get(self, file_id: str) -> dict | None:
        """Get single file metadata including import history."""
        async with aiosqlite.connect(str(self.db_path)) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM md_files WHERE id = ?", (file_id,)
            )
            row = await cursor.fetchone()
            if row is None:
                return None
            record = dict(row)
            record["imports"] = await self.get_imports(file_id)
            return record

    async def list_all(self) -> list[dict]:
        """List all saved markdown files, newest first."""
        async with aiosqlite.connect(str(self.db_path)) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM md_files ORDER BY created_at DESC"
            )
            rows = await cursor.fetchall()
            records = []
            for row in rows:
                record = dict(row)
                record["imports"] = await self.get_imports(record["id"])
                records.append(record)
            return records

    async def get_content(self, file_id: str) -> str | None:
        """Read markdown file content from filesystem."""
        record = await self.get(file_id)
        if record is None:
            return None
        md_path = self.storage_dir / record["md_filename"]
        if not md_path.exists():
            return None
        async with aiofiles.open(md_path, "r", encoding="utf-8") as f:
            return await f.read()

    async def update_content(self, file_id: str, new_content: str) -> dict | None:
        """Overwrite markdown file with new content (cache only).

        IMPORTANT: This does NOT sync to SAG KB. Users must manually delete
        the KB document and re-import for changes to take effect in search.
        """
        record = await self.get(file_id)
        if record is None:
            return None
        md_path = self.storage_dir / record["md_filename"]
        md_size = len(new_content.encode("utf-8"))
        now = datetime.now(timezone.utc).isoformat()

        async with aiofiles.open(md_path, "w", encoding="utf-8") as f:
            await f.write(new_content)

        async with aiosqlite.connect(str(self.db_path)) as db:
            await db.execute(
                "UPDATE md_files SET md_size_bytes = ?, updated_at = ? WHERE id = ?",
                (md_size, now, file_id),
            )
            await db.commit()

        return {"id": file_id, "md_size_bytes": md_size, "updated_at": now}

    async def delete(self, file_id: str) -> bool:
        """Delete .md file + metadata + import history.

        SAG KB documents are NOT affected.
        """
        record = await self.get(file_id)
        if record is None:
            return False
        md_path = self.storage_dir / record["md_filename"]
        if md_path.exists():
            await aio_os.remove(md_path)

        async with aiosqlite.connect(str(self.db_path)) as db:
            await db.execute("DELETE FROM md_imports WHERE md_file_id = ?", (file_id,))
            await db.execute("DELETE FROM md_files WHERE id = ?", (file_id,))
            await db.commit()
        return True

    # ------------------------------------------------------------------
    # Import tracking
    # ------------------------------------------------------------------

    async def record_import(
        self, file_id: str, project_id: str, project_name: str, document_id: str
    ) -> None:
        """Record a successful import into a SAG project."""
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(str(self.db_path)) as db:
            await db.execute(
                """INSERT OR IGNORE INTO md_imports
                   (md_file_id, project_id, project_name, document_id, imported_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (file_id, project_id, project_name, document_id, now),
            )
            await db.execute(
                "UPDATE md_files SET import_count = import_count + 1 WHERE id = ?",
                (file_id,),
            )
            await db.commit()

    async def get_imports(self, file_id: str) -> list[dict]:
        """Get all import history for a file."""
        async with aiosqlite.connect(str(self.db_path)) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM md_imports WHERE md_file_id = ? ORDER BY imported_at DESC",
                (file_id,),
            )
            return [dict(row) for row in await cursor.fetchall()]
