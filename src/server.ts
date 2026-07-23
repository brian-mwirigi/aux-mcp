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

FLAGSHIP HOOKS (prefer these — they return screenshot-ready ASCII cards):
- Natural language mood → \`vibe\` ("rainy 2am drive", "gym but cinematic")
- Taste roast → \`roast_my_playlist\`
- DNA fingerprint → \`playlist_dna\`
- Playlist fight → \`aux_battle\`
- Blind-date playlist → \`blend_tastes\`
- Group DJ voting → \`party_add\` / \`party_vote\` / \`party_play_winner\`
- Now-playing lore → \`whats_playing_story\`
- Numeric mood → \`set_mood\` · reshape playlist → \`adjust_playlist_vibe\`
- Skips/repeats → \`record_taste_feedback\` (biases future vibes)

Always surface the ASCII card from tool results when present — that's the shareable artifact.
For normal Spotify ops use search_*, play/pause/next, playlists, library, get_top_*.
IDs may be bare IDs, spotify: URIs, or open.spotify.com URLs.
Playback needs Premium + active device — get_devices if play fails.
If recommendations/audio-features 403, fall back to \`vibe\` / \`set_mood\`.`;

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
