#!/usr/bin/env node
/**
 * AUX — Spotify MCP server (stdio) + CLI.
 *
 *   node dist/server.js          → MCP over stdio
 *   node dist/server.js login    → browser OAuth (PKCE)
 *   node dist/server.js help
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadDotEnv } from "./env.js";
import { registerAllTools } from "./tools/register.js";
import { runLoginFlow } from "./login.js";
import { loadConfig, isUserLoggedIn } from "./config.js";

const INSTRUCTIONS = `You have AUX — Spotify for your AI.

YOU are the vibe model. There is no hardcoded mood dictionary.
When the user describes a feeling/scene, call \`vibe\` with:
1. text = their words
2. search_queries = 3–6 Spotify searches YOU invent (genres, scenes, eras, reference artists — be specific and varied)
3. energy / valence / tempo = YOUR numeric estimates

AUX will search the catalog + related artists + public playlists, then rank by your targets.

Other hooks (ASCII cards): roast_my_playlist, playlist_dna, aux_battle, blend_tastes,
party_*, whats_playing_story, set_mood, adjust_playlist_vibe, record_taste_feedback.

Always show ASCII cards from tool results. Use search_*/play/pause for normal ops.
Playback needs Premium + active device. IDs can be bare, URI, or open.spotify.com URLs.`;

async function main() {
  loadDotEnv();
  const cmd = process.argv[2];

  if (cmd === "login") {
    await runLoginFlow();
    return;
  }
  if (cmd === "status") {
    printStatus();
    return;
  }
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }
  if (cmd && cmd !== "serve") {
    console.error(`Unknown command: ${cmd}\n`);
    printHelp();
    process.exit(1);
  }

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.error(
      "aux-mcp: set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (MCP env or .env)."
    );
    process.exit(1);
  }

  const server = new McpServer(
    { name: "aux-mcp", version: "0.3.0" },
    { instructions: INSTRUCTIONS }
  );

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════╗
║           AUX  ·  mcp                ║
║     Spotify, for your AI.            ║
╚══════════════════════════════════════╝

  aux-mcp              Start MCP server (stdio)
  aux-mcp login        Browser OAuth (PKCE)
  aux-mcp status       Auth check
  aux-mcp help

Flagship tools: vibe · roast_my_playlist · playlist_dna
                aux_battle · blend_tastes · party_* 

Repo: https://github.com/brian-mwirigi/aux-mcp
`);
}

function printStatus(): void {
  try {
    const config = loadConfig();
    const loggedIn = isUserLoggedIn(config);
    console.log(`
AUX status
──────────
  Client ID     ${config.clientId.slice(0, 8)}…
  Redirect      ${config.redirectUri}
  Token dir     ${config.tokenDir}
  User login    ${loggedIn ? "yes ✓" : "no — run: aux-mcp login"}
`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("aux-mcp failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
