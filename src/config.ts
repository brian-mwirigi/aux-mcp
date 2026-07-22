import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

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
const DEFAULT_REDIRECT = `http://localhost:7654/callback`;

export function loadConfig(): SpotifyConfig {
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? DEFAULT_REDIRECT;
  const port = parseInt(process.env.SPOTIFY_PORT ?? String(DEFAULT_PORT), 10);
  const tokenDir =
    process.env.AUXC_MCP_TOKEN_DIR ?? join(homedir(), ".auxc-mcp");
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
      `Missing required environment variable ${name}. Set it in your MCP client config or shell.\n` +
        `Spotify dashboard: https://developer.spotify.com/dashboard`
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
    // Best-effort tighten perms; on Windows this is mostly a no-op.
    chmodSync(path, 0o600);
  } catch {
    // ignore
  }
}

export function clearStoredToken(path: string): void {
  if (existsSync(path)) {
    try {
      // Replace with empty so we don't leave dangling secrets.
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
