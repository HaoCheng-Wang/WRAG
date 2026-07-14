#!/bin/bash
# =============================================================================
# WRAG — Docker entrypoint
# Runs inside the WRAG container, managing the full stack:
#   1. Wait for PostgreSQL
#   2. Set up SAG database (.env + migrations)
#   3. Start SAG backend (Fastify, port 4173 — internal only)
#   4. Start MCP HTTP bridge (port 4174 — exposed for AI agents)
#   5. Start WRAG backend (FastAPI, port 8555 — serves frontend + REST API)
# =============================================================================
set -e

# ---------------------------------------------------------------------------
# Environment setup
# ---------------------------------------------------------------------------
PG_HOST="${POSTGRES_HOST:-postgres}"
PG_PORT="${POSTGRES_PORT:-5432}"

# Ensure DATABASE_URL is correct for Docker network (postgres service, not localhost)
# Environment variables from docker-compose override anything in SAG/.env
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
# 2. Ensure SAG/.env exists (dotenv needs it to load other vars like API keys)
# ---------------------------------------------------------------------------
if [ ! -f /app/SAG/.env ]; then
  echo "[WRAG] Creating SAG/.env from SAG/.env.example..."
  cp /app/SAG/.env.example /app/SAG/.env
  # DATABASE_URL already set in environment — dotenv won't override it
fi

# ---------------------------------------------------------------------------
# 3. Set up SAG database
# ---------------------------------------------------------------------------
echo "[WRAG] Setting up SAG database..."
cd /app/SAG
npm run db:setup 2>&1 | sed 's/^/  /'
cd /app

# ---------------------------------------------------------------------------
# 4. Start SAG backend (background, internal only)
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
# 5. Start MCP HTTP bridge (optional, depends on WRAG_MCP_SOURCE_ID)
# ---------------------------------------------------------------------------
if [ -n "${WRAG_MCP_SOURCE_ID}" ]; then
  echo "[WRAG] Starting MCP HTTP bridge on port 4174 (source_id: ${WRAG_MCP_SOURCE_ID})..."
  if [ -f /app/backend/mcp-http-server.ts ]; then
    cd /app/SAG
    SAG_MCP_SOURCE_ID="${WRAG_MCP_SOURCE_ID}" \
    MCP_HTTP_PORT=4174 \
    npx tsx /app/backend/mcp-http-server.ts > /tmp/mcp.log 2>&1 &
    MCP_PID=$!
    cd /app
    echo "[WRAG] MCP HTTP bridge started."
  else
    echo "[WRAG] WARNING: WRAG_MCP_SOURCE_ID is set but mcp-http-server.ts not found."
  fi
fi

# ---------------------------------------------------------------------------
# 6. Start WRAG backend (foreground)
# ---------------------------------------------------------------------------
echo "[WRAG] ========================================"
echo "[WRAG]  WRAG starting..."
echo "[WRAG]"
echo "[WRAG]  Frontend UI:   http://0.0.0.0:8555"
echo "[WRAG]  REST API:      http://0.0.0.0:8555/api"
if [ -n "${WRAG_MCP_SOURCE_ID}" ]; then
  echo "[WRAG]  MCP Protocol:  http://0.0.0.0:4174/mcp"
fi
echo "[WRAG] ========================================"

# Trap SIGTERM/SIGINT to shut down all child processes cleanly
cleanup() {
  echo "[WRAG] Shutting down..."
  kill $MCP_PID 2>/dev/null || true
  kill $SAG_PID 2>/dev/null || true
  wait $SAG_PID 2>/dev/null || true
  wait $MCP_PID 2>/dev/null || true
  echo "[WRAG] Shutdown complete."
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start WRAG backend in the foreground
cd /app
exec python backend/main.py