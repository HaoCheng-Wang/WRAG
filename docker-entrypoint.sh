#!/bin/bash
# =============================================================================
# WRAG — Docker entrypoint
# Runs inside the WRAG container, managing the full stack:
#   1. Wait for PostgreSQL
#   2. Set up SAG database (.env + migrations)
#   3. Start SAG backend (Fastify, port 4173 — internal only)
#   4. Start WRAG backend (FastAPI, port 8555 — frontend + REST API)
#
#   MCP HTTP bridge (port 4174) is started by WRAG backend automatically —
#   it discovers the first SAG project and binds to it. Set WRAG_MCP_SOURCE_ID
#   in docker-compose.yml to pin a specific project instead.
# =============================================================================
set -e

# ---------------------------------------------------------------------------
# Environment setup
# ---------------------------------------------------------------------------
PG_HOST="${POSTGRES_HOST:-postgres}"
PG_PORT="${POSTGRES_PORT:-5432}"

# Ensure DATABASE_URL is correct for Docker network (postgres service, not localhost)
export DATABASE_URL="${DATABASE_URL:-postgres://sag_lite:sag_lite_pass@${PG_HOST}:${PG_PORT}/sag_lite}"

# ---------------------------------------------------------------------------
# 1. Wait for PostgreSQL
# ---------------------------------------------------------------------------
echo "[WRAG] Waiting for PostgreSQL at ${PG_HOST}:${PG_PORT}..."
for i in $(seq 1 60); do
  if python3 -c "import socket; s=socket.socket(); s.settimeout(3); s.connect(('${PG_HOST}', ${PG_PORT})); s.close()" 2>/dev/null; then
    echo "[WRAG] PostgreSQL is ready!"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[WRAG] ERROR: PostgreSQL not available after 60 attempts."
    exit 1
  fi
  sleep 2
done

# ---------------------------------------------------------------------------
# 2. Ensure SAG/.env exists (dotenv needs it to load API key settings)
# ---------------------------------------------------------------------------
if [ ! -f /app/SAG/.env ]; then
  echo "[WRAG] Creating SAG/.env from SAG/.env.example..."
  cp /app/SAG/.env.example /app/SAG/.env
fi

# ---------------------------------------------------------------------------
# 3. Set up SAG database (idempotent)
# ---------------------------------------------------------------------------
echo "[WRAG] Setting up SAG database..."
cd /app/SAG
npm run db:setup 2>&1 | sed 's/^/  /'
cd /app

# ---------------------------------------------------------------------------
# 4. Start SAG backend (background, internal only — port 4173)
# ---------------------------------------------------------------------------
echo "[WRAG] Starting SAG backend..."
cd /app/SAG
npm run dev:api > /tmp/sag.log 2>&1 &
SAG_PID=$!
cd /app

# Wait for SAG to be healthy
echo "[WRAG] Waiting for SAG to become healthy..."
for i in $(seq 1 60); do
  if curl -s http://127.0.0.1:4173/health 2>/dev/null | grep -q ok; then
    echo "[WRAG] SAG is healthy!"
    break
  fi
  sleep 2
done

# ---------------------------------------------------------------------------
# 5. Start WRAG backend (foreground)
#    - Serves frontend static files + REST API on port 8555
#    - Auto-discovers first SAG project and starts MCP HTTP bridge on port 4174
#    - Use WRAG_MCP_SOURCE_ID env to pin a specific project (optional)
# ---------------------------------------------------------------------------
echo "[WRAG] ========================================"
echo "[WRAG]  WRAG starting..."
echo "[WRAG]"
echo "[WRAG]  Frontend UI:   http://0.0.0.0:8555"
echo "[WRAG]  REST API:      http://0.0.0.0:8555/api"
echo "[WRAG]  MCP Protocol:  http://0.0.0.0:4174/mcp  (auto-bound to first project)"
echo "[WRAG] ========================================"

# Trap SIGTERM/SIGINT to shut down all child processes cleanly
cleanup() {
  echo "[WRAG] Shutting down..."
  kill $SAG_PID 2>/dev/null || true
  wait $SAG_PID 2>/dev/null || true
  echo "[WRAG] Shutdown complete."
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start WRAG backend in the foreground (will auto-manage MCP bridge as subprocess)
cd /app
exec python backend/main.py
