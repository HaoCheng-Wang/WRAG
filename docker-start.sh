#!/bin/bash
# =============================================================================
# WRAG — Docker production startup
# Usage: ./docker-start.sh
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[WRAG] ========================================"
echo "[WRAG]  Building and starting WRAG..."
echo "[WRAG] ========================================"
echo ""

docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d --build

echo ""
echo "[WRAG] ========================================"
echo "[WRAG]  WRAG is running!"
echo "[WRAG]"
echo "[WRAG]  Frontend UI:   http://localhost:8555"
echo "[WRAG]  REST API:      http://localhost:8555/api"
echo "[WRAG]"
echo "[WRAG]  MCP Agent Access (Claude Desktop, Cursor, etc.):"
echo "[WRAG]    Endpoint: http://localhost:4174/mcp"
echo "[WRAG]    Config:"
echo '[WRAG]      { "mcpServers": { "wrag": { "type": "http", "url": "http://localhost:4174/mcp" } } }'
echo "[WRAG]    Tools: sag_search, sag_ingest_document, sag_explain_search, sag_get_event"
echo "[WRAG]"
echo "[WRAG]  To stop:  docker compose -f $SCRIPT_DIR/docker-compose.yml down"
echo "[WRAG] ========================================"