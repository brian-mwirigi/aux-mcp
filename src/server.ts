#!/usr/bin/env node
/**
 * AUX — Spotify MCP + CLI
 *
 *   npx aux-mcp              MCP stdio
 *   npx aux-mcp login
 *   npx aux-mcp autodj      Auto-DJ loop
 *   npx aux-mcp party-host  Friend-link relay
 *   npx aux-mcp web         Roast site
 *   npx aux-mcp demo        Terminal demo
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadDotEnv } from "./env.js";
import { registerAllTools } from "./tools/register.js";
import { runLoginFlow } from "./login.js";
import { loadConfig, isUserLoggedIn } from "./config.js";
import { startPartyHost } from "./rooms.js";
import { tickAutoDj, loadAutoDj } from "./autodj.js";

const INSTRUCTIONS = `You have AUX — Spotify for your AI.

YOU are the vibe model (no hardcoded dictionary). For vibes call \`vibe\` with:
text, search_queries (3–6 YOU invent), energy, valence, tempo.
Optional anti_algorithm=true to dodge top tracks + chart bait.

Peak hooks: context_vibe (time/weather), weekly_report, auto_dj_*, party_room_*,
roast_my_playlist, playlist_dna, aux_battle, blend_tastes, whats_playing_story.

Always show ASCII cards. Playback needs Premium + active device.`;

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  if (cmd === "party-host") {
    const port = parseInt(process.env.AUX_PARTY_PORT ?? "7655", 10);
    startPartyHost(port);
    return;
  }
  if (cmd === "autodj") {
    await runAutoDjLoop();
    return;
  }
  if (cmd === "web") {
    await serveWeb();
    return;
  }
  if (cmd === "demo") {
    await runDemo();
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
    { name: "aux-mcp", version: "0.4.0" },
    { instructions: INSTRUCTIONS }
  );
  registerAllTools(server);
  await server.connect(new StdioServerTransport());
}

async function runAutoDjLoop() {
  const session = loadAutoDj();
  if (!session?.active) {
    console.log(
      "No Auto-DJ session. In chat: auto_dj_start with a vibe, then run this again.\nOr start from Agent, then: npx aux-mcp autodj"
    );
    process.exit(1);
  }
  console.log(`Auto-DJ looping for: ${session.text}`);
  console.log("Ctrl+C to stop the loop (session stays until auto_dj_stop).\n");
  for (;;) {
    try {
      const r = await tickAutoDj();
      const ts = new Date().toLocaleTimeString();
      if (r.action === "refilled" || r.action === "started") {
        const name = (r.detail as any)?.matched?.[0]?.name ?? "?";
        console.log(`[${ts}] ${r.action} → ${name}`);
      } else {
        console.log(`[${ts}] ok (${r.action})`);
      }
    } catch (e) {
      console.error(`[tick error]`, e instanceof Error ? e.message : e);
    }
    await sleep(25_000);
  }
}

async function serveWeb() {
  const port = parseInt(process.env.AUX_WEB_PORT ?? "7656", 10);
  const webDir = resolveWebDir();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    path = path.replace(/\.\./g, "");
    const file = join(webDir, path);
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = file.split(".").pop();
    const types: Record<string, string> = {
      html: "text/html; charset=utf-8",
      js: "text/javascript; charset=utf-8",
      css: "text/css; charset=utf-8",
      svg: "image/svg+xml",
      json: "application/json",
    };
    res.writeHead(200, { "Content-Type": types[ext ?? ""] ?? "text/plain" });
    res.end(readFileSync(file));
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`
╔══════════════════════════════════════╗
║         AUX  ·  roast web            ║
╚══════════════════════════════════════╝
  Open http://127.0.0.1:${port}
  Paste a public playlist URL → get roasted.
`);
  });
}

function resolveWebDir(): string {
  const candidates = [
    join(__dirname, "../web"),
    join(__dirname, "web"),
    join(process.cwd(), "web"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) return c;
  }
  throw new Error("web/ folder not found — reinstall aux-mcp or run from repo root");
}

async function runDemo() {
  console.log(`
╔══════════════════════════════════════╗
║            AUX  ·  demo              ║
╚══════════════════════════════════════╝

  you:  rainy 2am drive

  aux → invents searches
        ["2am neo-soul", "night drive alt r&b", "rainy window indie"]
  aux → scores catalog · skips your repeats
  aux → drops the card:

┌──────────────────────────────────────────┐
│ AUX · VIBE                               │
├──────────────────────────────────────────┤
│ RAINY 2AM DRIVE                          │
│ 2am neo-soul · night drive alt r&b       │
│                                          │
│ energy  █████░░░░░░░░░░░ 0.30            │
│ valence █████░░░░░░░░░░░ 0.35            │
│ tempo   █████░░░░░░░░░░░ 92bpm           │
├──────────────────────────────────────────┤
│ 1. Rainy Window — …                      │
│ 2. LINK UP — …                           │
│ 3. Sober — …                             │
└──────────────────────────────────────────┘
  aux-mcp · pass the aux

  Also: roast · DNA · battle · party rooms · auto-DJ · weekly report

  → npx aux-mcp login
  → add to Cursor MCP
  → talk like a human
`);
}

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════╗
║           AUX  ·  mcp                ║
║     Spotify, for your AI.            ║
╚══════════════════════════════════════╝

  npx aux-mcp              Start MCP (stdio)
  npx aux-mcp login        Browser OAuth
  npx aux-mcp status
  npx aux-mcp autodj       Auto-DJ refill loop
  npx aux-mcp party-host   Friend-link relay (:7655)
  npx aux-mcp web          Roast site (:7656)
  npx aux-mcp demo         Terminal trailer
  npx aux-mcp help

Repo: https://github.com/brian-mwirigi/aux-mcp
`);
}

function printStatus(): void {
  try {
    const config = loadConfig();
    const loggedIn = isUserLoggedIn(config);
    const dj = loadAutoDj();
    console.log(`
AUX status
──────────
  Client ID     ${config.clientId.slice(0, 8)}…
  Redirect      ${config.redirectUri}
  Token dir     ${config.tokenDir}
  User login    ${loggedIn ? "yes ✓" : "no — npx aux-mcp login"}
  Auto-DJ       ${dj?.active ? `on · ${dj.text}` : "off"}
`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("aux-mcp failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
