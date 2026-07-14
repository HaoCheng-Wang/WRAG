/**
 * WRAG MCP HTTP Bridge
 *
 * Thin Node.js HTTP server that wraps SAG's MCP server with
 * MCP Streamable HTTP Transport — WITHOUT modifying any SAG source code.
 *
 * Uses createRequire anchored at SAG's package.json to load both
 * SAG's buildMcpServer() and the MCP SDK from SAG's node_modules.
 *
 * Usage:
 *   cd SAG
 *   SAG_MCP_SOURCE_ID=<uuid> DATABASE_URL=... npx tsx ../backend/mcp-http-server.ts
 *
 * AI Client Config (Claude Desktop):
 *   { "mcpServers": { "wrag": { "type": "http", "url": "http://host:4174/mcp" } } }
 */

import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const PORT = parseInt(process.env.MCP_HTTP_PORT || "4174", 10);
const HOST = process.env.MCP_HOST || "0.0.0.0";

// Resolve SAG directory relative to this file
const __dirname = dirname(fileURLToPath(import.meta.url));
const SAG_DIR = resolve(__dirname, "..", "SAG");

// Load SAG's buildMcpServer — use .ts extension since SAG has no .js build output.
// tsx handles the .ts → runtime mapping for dynamic import().
const { buildMcpServer } = await import(
  resolve(__dirname, "..", "SAG", "src", "mcp", "server.ts")
);
// MCP SDK is in SAG's node_modules — resolve from there using createRequire
const sagRequire = createRequire(resolve(SAG_DIR, "package.json"));
const { StreamableHTTPServerTransport } = sagRequire(
  "@modelcontextprotocol/sdk/server/streamableHttp.js"
);

(async function main() {
  if (!process.env.SAG_MCP_SOURCE_ID) {
    console.error("[WRAG-MCP] FATAL: SAG_MCP_SOURCE_ID is required.");
    process.exit(1);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  const mcpServer = buildMcpServer();
  await mcpServer.connect(transport);

  const httpServer = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers",
      "Content-Type, Authorization, MCP-Protocol-Version");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "POST" && (req.url === "/mcp" || req.url === "/api/mcp")) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      try {
        await transport.handleRequest(req, res, JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e: any) {
        console.error("[WRAG-MCP] error:", e.message);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      }
      return;
    }

    res.writeHead(404); res.end();
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`[WRAG-MCP] Listening on ${HOST}:${PORT}`);
    console.log(`[WRAG-MCP] Endpoint:  http://${HOST}:${PORT}/mcp`);
    console.log(`[WRAG-MCP] Source ID: ${process.env.SAG_MCP_SOURCE_ID}`);
    console.log("[WRAG-MCP] Tools: sag_ingest_document, sag_search, sag_explain_search, sag_get_event");
  });
})().catch((e) => { console.error("[WRAG-MCP] Fatal:", e); process.exit(1); });