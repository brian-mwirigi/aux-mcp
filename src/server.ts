#!/usr/bin/env node
/**
 * auxc-mcp — Spotify Web API MCP server (stdio).
 *
 * Env:
 *   SPOTIFY_CLIENT_ID       required
 *   SPOTIFY_CLIENT_SECRET   required
 *   SPOTIFY_REDIRECT_URI    optional (default http://localhost:7654/callback)
 *   AUXC_MCP_TOKEN_DIR      optional (default ~/.auxc-mcp)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/register.js";

async function main() {
  // Fail fast on missing credentials so MCP clients show a clear error.
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.error(
      "auxc-mcp: set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the MCP server env."
    );
    process.exit(1);
  }

  const server = new McpServer({
    name: "auxc-mcp",
    version: "0.1.0",
  });

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("auxc-mcp failed to start:", err);
  process.exit(1);
});
