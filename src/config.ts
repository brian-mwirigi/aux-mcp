import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { loadDotEnv } from "./env.js";

export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  /** Redirect URI registered in the Spotify dashboard. Must match exactly. */
  redirectUri: string;
  /** Port the local callback server listens on (must match the redirect URI). */
  port: number;
  /** Directory where the cached user token is stored. */
  tokenDir: string;
  /** Path to the cached user token JSON. */
  tokenFile: string;
  /** Path to the cached client-credentials token JSON. */
  clientTokenFile: string;
  /** Scopes requested during PKCE user login. */
  scopes: string[];
}

export const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "user-library-modify",
  "user-top-read",
  "user-read-recently-played",
  "user-follow-read",
  "user-follow-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "app-remote-control",
  "streaming",
];

const DEFAULT_PORT = 7654;
const DEFAULT_REDIRECT = `http://127.0.0.1:7654/callback`;

let dotenvLoaded = false;

function ensureDotEnv(): void {
  if (dotenvLoaded) return;
  loadDotEnv();
  dotenvLoaded = true;
}

function resolveTokenDir(): string {
  const fromEnv =
    process.env.AUX_MCP_TOKEN_DIR ?? process.env.AUXC_MCP_TOKEN_DIR;
  if (fromEnv) return fromEnv;

  const next = join(homedir(), ".aux-mcp");
  const legacy = join(homedir(), ".auxc-mcp");
  // Keep using legacy dir if the user already logged in there.
  if (!existsSync(next) && existsSync(legacy)) return legacy;
  return next;
}

export function loadConfig(): SpotifyConfig {
  ensureDotEnv();
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? DEFAULT_REDIRECT;
  const port = parseInt(process.env.SPOTIFY_PORT ?? String(DEFAULT_PORT), 10);
  const tokenDir = resolveTokenDir();
  return {
    clientId,
    clientSecret,
    redirectUri,
    port,
    tokenDir,
    tokenFile: join(tokenDir, "token.json"),
    clientTokenFile: join(tokenDir, "client-token.json"),
    scopes: SCOPES,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}.\n` +
        `  • Put it in your MCP config env, or\n` +
        `  • Create a .env file (see .env.example), or\n` +
        `  • export it in your shell\n` +
        `Dashboard: https://developer.spotify.com/dashboard`
    );
  }
  return value;
}

/** Shape of a stored token. Times are Unix ms epochs. */
export interface StoredToken {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
}

export function ensureTokenDir(config: SpotifyConfig): void {
  if (!existsSync(config.tokenDir)) {
    mkdirSync(config.tokenDir, { recursive: true });
  }
}

export function readStoredToken(path: string): StoredToken | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as StoredToken;
    if (!parsed.access_token || !parsed.expires_at) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredToken(path: string, token: StoredToken): void {
  const dir = dirname(path);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(token, null, 2), { encoding: "utf8" });
  try {
    chmodSync(path, 0o600);
  } catch {
    // ignore — Windows often can't chmod like Unix
  }
}

export function clearStoredToken(path: string): void {
  if (existsSync(path)) {
    try {
      writeFileSync(path, "{}", { encoding: "utf8" });
    } catch {
      // ignore
    }
  }
}

/** Returns true if the token will expire within the next N ms. */
export function tokenExpiringSoon(token: StoredToken, windowMs = 60_000): boolean {
  return Date.now() + windowMs >= token.expires_at;
}

export function tokenFile(config: SpotifyConfig, which: "user" | "client"): string {
  return which === "user" ? config.tokenFile : config.clientTokenFile;
}

export function isUserLoggedIn(config: SpotifyConfig): boolean {
  return readStoredToken(config.tokenFile) !== null;
}
