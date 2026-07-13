#!/bin/bash
# =============================================================================
# WRAG — Docker startup script (production mode)
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[WRAG] Building and starting all services..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

echo ""
echo "[WRAG] Services started:"
echo "  WRAG: http://localhost:8000"
echo "  PostgreSQL: localhost:5432"
echo ""
echo "[WRAG] To stop: docker compose -f $SCRIPT_DIR/docker-compose.yml down"
