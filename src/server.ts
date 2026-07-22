#!/usr/bin/env node
/**
 * AUX — Spotify MCP server (stdio) + CLI.
 *
 *   node dist/server.js          → MCP over stdio
 *   node dist/server.js login    → browser OAuth (PKCE)
 *   node dist/server.js help
 *
 * Env:
 *   SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET  required
 *   SPOTIFY_REDIRECT_URI                        optional
 *   AUX_MCP_TOKEN_DIR                           optional (~/.aux-mcp)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadDotEnv } from "./env.js";
import { registerAllTools } from "./tools/register.js";
import { runLoginFlow } from "./login.js";
import { loadConfig, isUserLoggedIn } from "./config.js";

const INSTRUCTIONS = `You are connected to AUX — a full Spotify MCP.

Prefer hooks when the user speaks in vibes or jokes:
- Mood / energy / "play something chill" → set_mood(energy, valence, tempo)
- "More upbeat" / reshape a playlist → adjust_playlist_vibe
- Roast my taste / playlist → roast_my_playlist
- Compare with a friend → music_compatibility
- User skips or replays a song → record_taste_feedback

For normal Spotify ops use the matching tool (search_*, play/pause/next, playlists, library, get_top_*).
IDs may be bare IDs, spotify: URIs, or open.spotify.com URLs.
Playback needs Spotify Premium + an active device — call get_devices first if play fails.
If get_recommendations or audio-features fail (Spotify app restrictions), fall back to set_mood.`;

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
    { name: "aux-mcp", version: "0.2.0" },
    { instructions: INSTRUCTIONS }
  );

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function printHelp(): void {
  console.log(`
AUX — Spotify for your AI (MCP)

Usage:
  aux-mcp              Start MCP server (stdio)
  aux-mcp login        One-time browser OAuth (PKCE)
  aux-mcp status       Show auth / token paths
  aux-mcp help         This message

Setup:
  1. Spotify Dashboard → Redirect URI: http://localhost:7654/callback
  2. Copy Client ID + Secret into .env or MCP config
  3. aux-mcp login
  4. Point Cursor / Claude at this binary

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
