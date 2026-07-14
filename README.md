# WRAG — Multi-Format RAG Knowledge Base

**WRAG** (Wrapper for RAG) combines [MarkItDown](https://github.com/microsoft/markitdown) and [SAG](https://github.com/Zleap-AI/SAG) into a unified knowledge base system.

**Core workflow:** Upload **any format** file → MarkItDown converts to Markdown → SAG ingests & enables RAG retrieval.

---

## Features

- **Multi-format upload**: PDF, DOCX, PPTX, XLSX, CSV, HTML, EPUB, images, audio, ZIP, Jupyter notebooks, and more — all formats supported by MarkItDown
- **Markdown persistence**: Converted `.md` files are saved and can be viewed, edited, downloaded, or re-imported into different projects
- **Knowledge graph**: Interactive force-directed graph visualization of extracted entities and events with double-click detail inspection
- **Conversational RAG**: Chat interface with MCP-powered retrieval, markdown rendering, streaming responses, and citation support
- **MCP Agent Integration**: Built-in MCP HTTP bridge — auto-discovers projects, binds dynamically, connects to Claude Desktop, Cursor, or any MCP-compatible AI client
- **Modern UI**: Ant Design 5 based interface with Chinese/English i18n (auto-detect)
- **Independent management**: Markdown files and KB content are independently managed — delete one without affecting the other
- **Docker deployment**: Single container for production; includes MCP HTTP bridge for agent access

---

## Architecture

```
                  ┌──────────────────────────────┐
                  │   AI Agents (Claude Desktop,  │
                  │   Cursor, custom clients)     │
                  └──────────┬───────────────────┘
                             │ MCP Protocol (HTTP/SSE)
                             ▼ port 4174
┌────────────────────────────────────────────────────────┐
│                    WRAG Container                        │
│                                                          │
│  WRAG Frontend (React + Ant Design 5)                    │
│        │  Served as static files by FastAPI              │
│        ▼                                                │
│  WRAG Backend (FastAPI + Python, Port 8555)              │
│    ├── POST /api/wrag/upload       → Upload + convert    │
│    ├── /api/wrag/markdown/*        → Markdown management │
│    ├── /api/wrag/mcp/bind          → Dynamic MCP binding │
│    ├── /api/*                      → Proxy to SAG        │
│    └── Frontend static files at /                       │
│        │                                                 │
│        ▼                                                 │
│  SAG Backend (Fastify, Port 4173) — unchanged            │
│        │                                                 │
│        ▼                                                 │
│  MCP HTTP Bridge (Port 4174)                             │
│    Auto-discovered & managed by WRAG backend             │
│    Tools: sag_search, sag_ingest_document,               │
│           sag_explain_search, sag_get_event              │
└──────────────────────┬─────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │ PostgreSQL 16    │
              │ + pgvector       │
              │ (Docker, :5432)  │
              └─────────────────┘
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **Python** >= 3.10
- **Docker**

### Development Mode (quick test / UI preview)

```bash
# 1. Clone WRAG
git clone https://github.com/HaoCheng-Wang/WRAG.git
cd WRAG

# 2. Clone the two dependency projects INSIDE the WRAG directory
git clone https://github.com/microsoft/markitdown.git
git clone https://github.com/Zleap-AI/SAG.git

# 3. One-click startup (auto-creates .env, installs dependencies, starts all services)
./start.sh
```

Then open **http://localhost:5174**

`start.sh` handles everything:
1. Smart-sync `.env` files (create if missing, add new keys without overwriting)
2. Create Python venv + install dependencies + MarkItDown
3. Install npm dependencies for SAG and frontend
4. Start PostgreSQL via Docker
5. Initialize SAG database (migrations + seed)
6. Start WRAG backend (auto-starts SAG API + MCP HTTP bridge as subprocesses)
7. Start WRAG frontend Vite dev server (port 5174)
8. Remind about AI API key configuration if missing

### Docker Production Mode

```bash
./docker-start.sh
```

This builds a single Docker container with:
- **Port 8555** — Frontend UI + REST API (both served by FastAPI)
- **Port 4174** — MCP HTTP endpoint for AI agents (auto-bound to the first SAG project)

---

## MCP Agent Integration

WRAG includes an MCP HTTP bridge that exposes SAG's knowledge base tools to AI clients via the standard [Model Context Protocol](https://modelcontextprotocol.io/).

### Available Tools

| Tool | Description |
|------|-------------|
| `sag_search` | Search the knowledge base with semantic + keyword retrieval |
| `sag_ingest_document` | Ingest a document into the knowledge base |
| `sag_explain_search` | Get detailed search trace and explanation |
| `sag_get_event` | Retrieve a specific event by UUID |

### Project Binding

The MCP bridge **auto-discovers** the first SAG project at startup. To change which project is bound:

1. Open the **MCP tab** in the WRAG frontend
2. Use the dropdown to select a different project
3. Click **"Switch Binding"** — the bridge restarts instantly

Or set `WRAG_MCP_SOURCE_ID` in `.env` / `docker-compose.yml` to pin a specific project permanently.

### Connecting Claude Desktop

Add to your `claude_desktop_config.json` (or `mcp.json`):

```json
{
  "mcpServers": {
    "wrag": {
      "type": "http",
      "url": "http://localhost:4174/mcp"
    }
  }
}
```

> Replace `localhost` with the server address when accessing remotely.

---

## Configuration

### WRAG settings (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `WRAG_HOST` | `0.0.0.0` | Backend bind address |
| `WRAG_PORT` | `8555` | Backend port |
| `SAG_API_URL` | `http://127.0.0.1:4173` | Internal SAG API address |
| `MD_STORAGE_DIR` | `md_storage` | Markdown file storage directory |
| `WRAG_MAX_UPLOAD_SIZE_MB` | *(blank)* | Max upload size in MB. Blank = no limit |
| `WRAG_MCP_SOURCE_ID` | *(auto)* | Pin MCP bridge to a specific project UUID. Leave blank for auto-discovery |

> **Note:** `DATABASE_URL` is configured in `SAG/.env` only. WRAG uses SQLite for its own metadata and does not need PostgreSQL credentials.

### SAG / AI settings (`SAG/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Logging level |
| `HTTP_HOST` | `0.0.0.0` | SAG API bind address |
| `HTTP_PORT` | `4173` | SAG API port |
| `DATABASE_URL` | `postgres://sag_lite:sag_lite_pass@localhost:5432/sag_lite` | PostgreSQL connection |
| `DEFAULT_TENANT_ID` | `default` | Multi-tenant ID |
| `AUTH_MODE` | `none` | Auth mode (none/bearer/external) |
| `EMBEDDING_DIMENSIONS` | `1024` | Vector dimensions |
| `EMBEDDING_MODEL` | `text-embedding-3-large` | Embedding model name |
| `EMBEDDING_API_KEY` | *(blank)* | API key for embedding service |
| `EMBEDDING_BASE_URL` | `https://api.302ai.cn/v1` | Embedding API base URL |
| `LLM_MODEL` | `qwen3.6-flash` | LLM model name |
| `LLM_API_KEY` | *(blank)* | API key for LLM service |
| `LLM_BASE_URL` | `https://api.302ai.cn/v1` | LLM API base URL |
| `LLM_TIMEOUT_MS` | `60000` | LLM request timeout (ms) |
| `LLM_MAX_RETRIES` | `2` | LLM retry count |
| `RERANK_MODEL` | `qwen3-rerank` | Rerank model name |
| `RERANK_BASE_URL` | *(blank, falls back to `LLM_BASE_URL`)* | Rerank API base URL |
| `RERANK_INSTRUCT` | *(instruction text)* | Rerank prompt instruction |
| `DEFAULT_SEARCH_MODE` | `fast` | Default search mode (fast/standard) |
| `INGEST_CONCURRENCY` | `5` | Concurrent chunk processing limit |
| `MCP_TRANSPORT` | `stdio` | MCP transport protocol |
| `MCP_HTTP_PORT` | `4174` | MCP HTTP port |
| `MCP_TOOL_TIMEOUT_MS` | `300000` | MCP tool timeout (ms) |

> When no API keys are configured, SAG uses deterministic local fallbacks: SHA-256 embeddings, regex-based entity extraction, and lexical keyword reranking.

---

## API Reference

### WRAG-specific endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (WRAG + SAG status) |
| `GET` | `/api/formats` | List supported file formats |
| `POST` | `/api/wrag/upload` | Upload file → convert → ingest |
| `POST` | `/api/wrag/upload/stream` | Upload with SSE progress streaming |
| `GET` | `/api/wrag/mcp/binding` | Get current MCP bridge project binding |
| `POST` | `/api/wrag/mcp/bind` | Switch MCP bridge to a different project |

### Markdown file management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/wrag/markdown` | List all saved markdown files |
| `GET` | `/api/wrag/markdown/{id}` | Get file metadata + import history |
| `GET` | `/api/wrag/markdown/{id}/content` | Get raw markdown content |
| `GET` | `/api/wrag/markdown/{id}/download` | Download `.md` file |
| `PATCH` | `/api/wrag/markdown/{id}/content` | Edit markdown content (cache only) |
| `DELETE` | `/api/wrag/markdown/{id}` | Delete markdown file (KB unaffected) |
| `POST` | `/api/wrag/markdown/{id}/import` | Import saved markdown into a project |

### SAG proxy

All `/api/*` endpoints are transparently proxied to SAG. See [SAG documentation](https://github.com/Zleap-AI/SAG) for full API reference.

### MCP endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mcp` (port 4174) | MCP JSON-RPC endpoint (Streamable HTTP) |

---

## Design Decisions

1. **No file size limit by default**: MarkItDown itself has none. WRAG applies a configurable limit only if `WRAG_MAX_UPLOAD_SIZE_MB` is set.
2. **Markdown files & KB are independent**: Deleting a saved `.md` does not affect the KB; deleting a KB document does not delete the `.md`. This enables re-import across projects.
3. **Markdown editing is cache-only**: Editing `.md` content only modifies the local file. To update the KB, delete the document and re-import.
4. **SAG as subprocess**: WRAG backend starts SAG automatically on boot — no manual orchestration.
5. **Ant Design**: Distinct UI from SAG's Tailwind; rich Chinese-friendly component library.
6. **Proxy all SAG APIs**: Frontend communicates only with WRAG backend on port 8555. SAG's own frontend is not started — WRAG replaces it entirely.
7. **MCP HTTP Bridge**: Thin Node.js wrapper imports SAG's `buildMcpServer()` and wraps it with `StreamableHTTPServerTransport` — zero modification to SAG source code.
8. **Auto-discovery + dynamic binding**: MCP bridge auto-binds to the first project. Users can switch binding on-the-fly from the frontend MCP tab without editing config files or restarting the container.
9. **Single container for production**: WRAG Docker image bundles the frontend (built static files), backend, SAG API, and MCP bridge — expose ports 8555 (UI+API) and 4174 (MCP).
10. **SQLite for WRAG metadata**: PostgreSQL is SAG's concern. WRAG uses SQLite for markdown file tracking, keeping responsibilities cleanly separated.

---

## License

MIT — same as both MarkItDown and SAG.

## Credits

- [MarkItDown](https://github.com/microsoft/markitdown) — Microsoft
- [SAG](https://github.com/Zleap-AI/SAG) — Zleap-AI
