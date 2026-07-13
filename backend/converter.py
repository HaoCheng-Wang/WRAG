"""MarkItDown conversion wrapper.

markitdown itself has NO file size limits — the practical limit is server RAM.
All size enforcement is done at the WRAG application layer (see config.py).
"""

from pathlib import Path
from markitdown import MarkItDown

# Single shared instance — MarkItDown is stateless and thread-safe
_md_converter = MarkItDown()


def convert_to_markdown(file_path: str | Path) -> str:
    """Convert any supported file to Markdown text.

    Args:
        file_path: Path to the file to convert.

    Returns:
        The converted markdown string.
    """
    result = _md_converter.convert(str(file_path))
    return result.markdown
