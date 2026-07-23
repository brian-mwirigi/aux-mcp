#!/usr/bin/env node
/**
 * One-time Spotify OAuth login (Authorization Code + PKCE).
 *
 *   npx spotify-aux login
 *   npm run login
 */
import http from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import open from "open";
import pkceChallenge from "pkce-challenge";
import { loadConfig, ensureTokenDir, SCOPES, isUserLoggedIn } from "./config.js";
import { exchangeAuthorizationCode } from "./auth.js";

export async function runLoginFlow(): Promise<void> {
  const config = loadConfig();
  ensureTokenDir(config);

  if (isUserLoggedIn(config)) {
    console.log("\n✓ Already logged in.");
    console.log(`  Token: ${config.tokenFile}`);
    console.log("  Re-auth anyway? Delete that file and run login again.\n");
    return;
  }

  const { code_verifier, code_challenge } = await pkceChallenge();
  const state = cryptoRandom(16);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", code_challenge);

  console.log(`
╔══════════════════════════════════════╗
║           AUX  ·  login              ║
╚══════════════════════════════════════╝
  Redirect  ${config.redirectUri}
  Tokens →  ${config.tokenFile}

  Opening Spotify in your browser…
`);

  const code = await new Promise<string>((resolveCode, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${config.port}`);
        if (url.pathname !== "/callback") {
          res.writeHead(404).end("Not found");
          return;
        }
        const errParam = url.searchParams.get("error");
        if (errParam) {
          res
            .writeHead(400, { "Content-Type": "text/html" })
            .end(htmlPage("Login failed", `Spotify error: <code>${errParam}</code>`));
          server.close();
          reject(new Error(`OAuth error: ${errParam}`));
          return;
        }
        const codeParam = url.searchParams.get("code");
        const stateParam = url.searchParams.get("state");
        if (!codeParam || stateParam !== state) {
          res
            .writeHead(400, { "Content-Type": "text/html" })
            .end(htmlPage("Invalid callback", "Missing code or state mismatch."));
          server.close();
          reject(new Error("Invalid OAuth callback"));
          return;
        }
        res
          .writeHead(200, { "Content-Type": "text/html" })
          .end(
            htmlPage(
              "You're in.",
              "AUX is authorized. Close this tab and go make something sound good."
            )
          );
        server.close();
        resolveCode(codeParam);
      } catch (e) {
        reject(e);
      }
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${config.port} is busy. Free it, or set SPOTIFY_PORT + matching SPOTIFY_REDIRECT_URI.`
          )
        );
      } else {
        reject(err);
      }
    });

    server.listen(config.port, "127.0.0.1", async () => {
      console.log(`  Listening on http://127.0.0.1:${config.port}`);
      console.log(`  If nothing opens, paste this:\n\n${authUrl.toString()}\n`);
      try {
        await open(authUrl.toString());
      } catch {
        console.log("  (Couldn't auto-open the browser — use the URL above.)");
      }
    });
  });

  process.stdout.write("  Exchanging code… ");
  await exchangeAuthorizationCode(code, code_verifier, config);
  console.log("done.\n");
  console.log("✓ Logged in. Playback, playlists, library, and hooks are live.\n");
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${title} · AUX</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:wght@400;500&display=swap');
  body{font-family:'DM Sans',system-ui,sans-serif;background:#070707;color:#f2f2f2;
  display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;
  background-image:radial-gradient(ellipse 80% 50% at 50% -20%,#1DB95433,transparent)}
  .card{max-width:440px;padding:2.25rem 2rem;border:1px solid #1a1a1a;border-radius:16px;
  background:#0c0c0c}
  .brand{font-family:Syne,sans-serif;letter-spacing:.12em;font-size:.75rem;color:#1DB954;
  margin:0 0 1rem;text-transform:uppercase}
  h1{font-family:Syne,sans-serif;font-size:1.75rem;margin:0 0 .75rem;letter-spacing:-.02em}
  p{margin:0;line-height:1.55;color:#a3a3a3} code{color:#1DB954;font-size:.9em}
</style></head>
<body><div class="card"><p class="brand">AUX</p><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

function cryptoRandom(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("hex");
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return /login\.(js|ts)$/.test(entry);
  }
}

if (isDirectRun()) {
  runLoginFlow().catch((err) => {
    console.error("\nLogin failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
