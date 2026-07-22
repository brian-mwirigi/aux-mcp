#!/usr/bin/env node
/**
 * One-time Spotify OAuth login (Authorization Code + PKCE).
 * Opens a browser, listens on localhost for the callback, stores tokens in ~/.auxc-mcp/token.json
 *
 * Usage:
 *   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... npm run login
 */
import http from "node:http";
import { URL } from "node:url";
import open from "open";
import pkceChallenge from "pkce-challenge";
import { loadConfig, ensureTokenDir, SCOPES } from "./config.js";
import { exchangeAuthorizationCode } from "./auth.js";

async function runLoginFlow() {
  const config = loadConfig();
  ensureTokenDir(config);

  const { code_verifier, code_challenge } = await pkceChallenge();
  const state = cryptoRandom(16);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set(
    "scope",
    (config.scopes.length ? config.scopes : SCOPES).join(" ")
  );
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", code_challenge);

  console.log("\nauxc-mcp — Spotify login");
  console.log("────────────────────────");
  console.log(`Redirect URI : ${config.redirectUri}`);
  console.log(`Token file   : ${config.tokenFile}`);
  console.log("\nWaiting for browser authorization…\n");

  const code = await new Promise<string>((resolve, reject) => {
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
            .end(
              htmlPage("Login failed", `Spotify error: <code>${errParam}</code>`)
            );
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
              "You're in",
              "Authorization complete. Return to your terminal — you can close this tab."
            )
          );
        server.close();
        resolve(codeParam);
      } catch (e) {
        reject(e);
      }
    });

    server.on("error", reject);
    server.listen(config.port, "127.0.0.1", async () => {
      console.log(
        `Callback server listening on http://127.0.0.1:${config.port}`
      );
      console.log(
        `If the browser doesn't open, visit:\n${authUrl.toString()}\n`
      );
      try {
        await open(authUrl.toString());
      } catch {
        console.log("(Could not auto-open browser — paste the URL above.)");
      }
    });
  });

  console.log("Exchanging authorization code…");
  await exchangeAuthorizationCode(code, code_verifier, config);
  console.log(`\n✓ Logged in. Token saved to ${config.tokenFile}\n`);
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;
  display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{max-width:420px;padding:2rem;border:1px solid #222;border-radius:12px;background:#111}
  h1{font-size:1.25rem;margin:0 0 .75rem;color:#1DB954}
  p{margin:0;line-height:1.5;color:#ccc} code{color:#1DB954}
</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

function cryptoRandom(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("hex");
}

runLoginFlow().catch((err) => {
  console.error("\nLogin failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
