# =============================================================================
# WRAG — Dockerfile
# Multi-stage build:
#   1. frontend-builder: Build the React frontend (Node.js)
#   2. final: Python + Node.js runtime, runs everything in one container
# =============================================================================

# ---- Stage 1: Build frontend ----
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npx vite build --outDir dist

# ---- Stage 2: Final image ----
FROM python:3.11-slim-bookworm

# Install Node.js 20 (needed to run SAG and MCP HTTP bridge)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ---- Python dependencies ----
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Copy source code ----
COPY . .

# ---- Install markitdown ----
RUN pip install --no-cache-dir -e ./markitdown/packages/markitdown[all]

# ---- Install SAG dependencies ----
RUN cd SAG && npm install

# ---- Install MCP bridge dependencies (at WRAG root level) ----
# The MCP HTTP bridge imports @modelcontextprotocol/sdk at runtime.
# We install it at WRAG root level so Node.js can resolve it.
RUN cd /app && npm install

# ---- Copy built frontend from stage 1 ----
COPY --from=frontend-builder /app/dist frontend/dist

# ---- Entrypoint ----
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8555 4174
ENTRYPOINT ["/entrypoint.sh"]