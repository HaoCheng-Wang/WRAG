#!/usr/bin/env bash
# =============================================================================
# WRAG — One-Click Startup Script (Linux / macOS)
# =============================================================================
# Expected directory layout:
#   WRAG/
#   ├── start.sh          ← you are here
#   ├── markitdown/       ← git clone https://github.com/microsoft/markitdown.git
#   ├── SAG/              ← git clone https://github.com/Zleap-AI/SAG.git
#   ├── backend/
#   ├── frontend/
#   └── ...
# =============================================================================
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[WRAG]${NC} $1"; }
warn() { echo -e "${YELLOW}[WRAG]${NC} $1"; }
err()  { echo -e "${RED}[WRAG]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
SAG_DIR="$SCRIPT_DIR/SAG"
MARKITDOWN_DIR="$SCRIPT_DIR/markitdown"
MD_STORAGE_DIR="$SCRIPT_DIR/md_storage"

log "========================================="
log " WRAG — Multi-Format RAG Knowledge Base"
log "========================================="
echo ""

# ---------------------------------------------------------------------------
# 1. Prerequisites check
# ---------------------------------------------------------------------------
log "Checking prerequisites..."

if ! command -v node &>/dev/null; then
    err "Node.js is not installed. Please install Node.js >= 20."
    exit 1
fi
log "  Node.js $(node --version)"

if ! command -v python3 &>/dev/null; then
    err "Python 3 is not installed. Please install Python >= 3.10."
    exit 1
fi
log "  Python $(python3 --version)"

if ! command -v docker &>/dev/null; then
    err "Docker is not installed. Please install Docker."
    exit 1
fi
log "  Docker OK"

# ---------------------------------------------------------------------------
# 2. Verify sub-projects exist
# ---------------------------------------------------------------------------
if [ ! -d "$MARKITDOWN_DIR" ]; then
    err "markitdown/ directory not found!"
    err "  Run: git clone https://github.com/microsoft/markitdown.git"
    exit 1
fi

if [ ! -d "$SAG_DIR" ]; then
    err "SAG/ directory not found!"
    err "  Run: git clone https://github.com/Zleap-AI/SAG.git"
    exit 1
fi

# ---------------------------------------------------------------------------
# 3. Python virtual environment
# ---------------------------------------------------------------------------
log "Setting up Python virtual environment..."
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
    log "  Created .venv at $VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
pip install --quiet -r "$SCRIPT_DIR/requirements.txt"
pip install --quiet -e "$MARKITDOWN_DIR/packages/markitdown[all]"
log "  Python dependencies installed."

# ---------------------------------------------------------------------------
# 4. SAG dependencies
# ---------------------------------------------------------------------------
log "Installing SAG dependencies..."
if [ ! -d "$SAG_DIR/node_modules" ]; then
    cd "$SAG_DIR"
    npm install --silent
    cd "$SCRIPT_DIR"
fi
log "  SAG dependencies ready."

# ---------------------------------------------------------------------------
# 5. PostgreSQL
# ---------------------------------------------------------------------------
log "Starting PostgreSQL (Docker)..."
if ! docker ps --format '{{.Names}}' | grep -q 'wrag_postgres'; then
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d postgres
    log "  PostgreSQL container started."
else
    log "  PostgreSQL already running."
fi

# ---------------------------------------------------------------------------
# 6. SAG database setup
# ---------------------------------------------------------------------------
log "Setting up SAG database..."
cd "$SAG_DIR"
npm run db:setup --silent 2>&1 | sed 's/^/  /'
cd "$SCRIPT_DIR"
log "  Database ready."

# ---------------------------------------------------------------------------
# 7. Markdown storage
# ---------------------------------------------------------------------------
mkdir -p "$MD_STORAGE_DIR"
log "  Markdown storage: $MD_STORAGE_DIR"

# ---------------------------------------------------------------------------
# 8. Start services
# ---------------------------------------------------------------------------
echo ""
log "========================================="
log " Starting WRAG services..."
log "========================================="
log ""
log "  WRAG Backend:  http://localhost:8000"
log "  WRAG Frontend: http://localhost:5174"
log "  SAG API:       http://localhost:4173 (internal)"
log ""
log "  Press Ctrl+C to stop all services."
log ""

# Trap SIGINT to stop background processes
cleanup() {
    echo ""
    log "Shutting down..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID 2>/dev/null || true
    wait $FRONTEND_PID 2>/dev/null || true
    log "All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start WRAG backend (which auto-starts SAG)
cd "$SCRIPT_DIR"
python backend/main.py &
BACKEND_PID=$!
log "  Backend PID: $BACKEND_PID"

# Wait for backend to be healthy
log "  Waiting for backend to become ready..."
for i in $(seq 1 60); do
    if curl -s http://localhost:8000/health >/dev/null 2>&1; then
        log "  Backend is ready!"
        break
    fi
    sleep 2
done

# Start WRAG frontend dev server
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
log "  Frontend PID: $FRONTEND_PID"

echo ""
log "========================================="
log " All services started. Open:"
log "   ${CYAN}http://localhost:5174${NC}"
log "========================================="

# Wait for background processes
wait
