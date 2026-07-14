# WRAG — Multi-Format RAG Knowledge Base

**WRAG** (Wrapper for RAG) combines [MarkItDown](https://github.com/microsoft/markitdown) and [SAG](https://github.com/Zleap-AI/SAG) into a unified knowledge base system.

**Core workflow:** Upload **any format** file → MarkItDown converts to Markdown → SAG ingests & enables RAG retrieval.

---

## Features

- **Multi-format upload**: PDF, DOCX, PPTX, XLSX, CSV, HTML, EPUB, images, audio, ZIP, Jupyter notebooks, and more — all formats supported by MarkItDown
- **Markdown persistence**: Converted `.md` files are saved and can be viewed, edited, downloaded, or re-imported into different projects
- **Knowledge graph**: Interactive force-directed graph visualization of extracted entities and events
- **Conversational RAG**: Chat interface with MCP-powered retrieval, streaming responses, and citation support
- **MCP integration**: Built-in MCP server for external AI clients (Claude Desktop, Cursor, etc.)
- **Modern UI**: Ant Design 5 based interface with Chinese/English i18n
- **Independent management**: Markdown files and KB content are independently managed — delete one without affecting the other

---

## Architecture

```
WRAG Frontend (React + Ant Design 5, Port 5174)
       │
       ▼
WRAG Backend (FastAPI + Python, Port 8000)
  ├── POST /api/wrag/upload       → File upload + conversion
  ├── /api/wrag/markdown/*        → Markdown file management
  └── /api/*                      → Proxy to SAG
       │
       ▼
SAG Backend (Fastify, Port 4173) — unchanged
       │
       ▼
PostgreSQL + pgvector (Docker, Port 5432)
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **Python** >= 3.10
- **Docker**

### Download & Setup

```bash
# 1. Clone WRAG
git clone https://github.com/HaoCheng-Wang/WRAG.git
cd WRAG

# 2. Clone the two dependency projects INSIDE the WRAG directory
git clone https://github.com/microsoft/markitdown.git
git clone https://github.com/Zleap-AI/SAG.git

# 3. One-click startup
./start.sh
```

The resulting directory layout:

```
WRAG/
├── start.sh              # One-click startup
├── docker-compose.yml    # PostgreSQL container
├── .env                  # WRAG config (auto-created by start.sh)
├── .env.example          # WRAG config template
├── requirements.txt      # Python dependencies
├── README.md
├── backend/              # FastAPI application
├── frontend/             # React SPA (Ant Design 5)
├── markitdown/           # git clone from microsoft/markitdown
├── SAG/                  # git clone from Zleap-AI/SAG
│   └── .env              # SAG / AI config (auto-created by start.sh)
├── .venv/                # Created by start.sh
└── md_storage/           # Created at runtime — persisted .md files
```

Then open: **http://localhost:5174**

`start.sh` will:
1. Check that `markitdown/` and `SAG/` directories exist
2. Smart-sync `.env` files from `.env.example` — create if missing, add new keys without overwriting existing
3. Create Python virtual environment (`.venv`) and install dependencies
4. Install SAG npm dependencies
5. Install WRAG Frontend npm dependencies
6. Start PostgreSQL via Docker
7. Initialize SAG database (migrations + seed)
8. Create `md_storage/` directory
9. Start WRAG backend (which auto-starts SAG API)
10. Start WRAG frontend dev server
11. Remind about AI API key configuration if keys are missing

> **💡 SAG runs in local fallback mode without API keys.** You can explore the UI first, then configure AI keys later.

### Configuring AI Features

After the first run, edit the configuration files to enable full AI-powered retrieval:

| File | Purpose | Key variables to set |
|------|---------|---------------------|
| `SAG/.env` | AI models & API keys | `EMBEDDING_API_KEY`, `LLM_API_KEY` |
| `.env` | WRAG server settings | `WRAG_PORT`, `WRAG_MAX_UPLOAD_SIZE_MB` |

Then restart:

```bash
./start.sh
```

> **Note:** `start.sh` performs a smart sync — if `.env.example` has new variables after an upgrade, they are automatically appended to your `.env` with a `[NEW]` marker. Your existing settings are never overwritten.

### Manual Setup (without start.sh)

This section shows what `start.sh` does internally. Use this for debugging or manual deployment.

```bash
# Prerequisites: clone markitdown and SAG inside WRAG/ first

# 1. Create environment files
cp .env.example .env
cp SAG/.env.example SAG/.env
# Edit both files to configure API keys and settings

# 2. Python venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e ./markitdown/packages/markitdown[all]

# 3. SAG dependencies
cd SAG && npm install && cd ..

# 4. WRAG Frontend dependencies
cd frontend && npm install && cd ..

# 5. PostgreSQL
docker compose up -d postgres

# 6. Database setup
cd SAG && npm run db:setup && cd ..

# 7. Start (two terminals)
python backend/main.py          # Terminal 1: WRAG backend
cd frontend && npm run dev      # Terminal 2: WRAG frontend
```

---

## Configuration

### WRAG settings (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `WRAG_HOST` | `0.0.0.0` | Backend bind address |
| `WRAG_PORT` | `8000` | Backend port |
| `SAG_API_URL` | `http://127.0.0.1:4173` | Internal SAG API address |
| `MD_STORAGE_DIR` | `md_storage` | Markdown file storage directory |
| `WRAG_MAX_UPLOAD_SIZE_MB` | *(blank)* | Max upload size in MB. Blank = no limit |
| `DATABASE_URL` | `postgres://sag_lite:sag_lite_pass@localhost:5432/sag_lite` | PostgreSQL connection |

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

> When no API keys are configured, SAG uses deterministic local fallbacks: SHA-256 embeddings, regex-based entity extraction, and lexical keyword reranking. The system boots and functions without remote API access.

---

## API Reference

### WRAG-specific endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (WRAG + SAG status) |
| `GET` | `/api/formats` | List supported file formats |
| `POST` | `/api/wrag/upload` | Upload file → convert → ingest |
| `POST` | `/api/wrag/upload/stream` | Upload with SSE progress streaming |

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

---

## Design Decisions

1. **No file size limit by default**: MarkItDown itself has none. WRAG applies a configurable application-layer limit only if `WRAG_MAX_UPLOAD_SIZE_MB` is set.
2. **Markdown files & KB are independent**: Deleting a saved `.md` does not affect the KB; deleting a KB document does not delete the `.md`. This enables re-import across projects.
3. **Markdown editing is cache-only**: Editing `.md` content only modifies the local file. To update the KB, delete the document and re-import.
4. **SAG as subprocess**: WRAG backend starts SAG automatically on boot — no manual orchestration.
5. **Ant Design**: Distinct UI from SAG's Tailwind; rich Chinese-friendly component library.
6. **Proxy all SAG APIs**: Frontend communicates only with WRAG backend on port 8000.

---

## License

MIT — same as both MarkItDown and SAG.

## Credits

- [MarkItDown](https://github.com/microsoft/markitdown) — Microsoft
- [SAG](https://github.com/Zleap-AI/SAG) — Zleap-AI
