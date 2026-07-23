import {
  type SpotifyConfig,
  type StoredToken,
  loadConfig,
  readStoredToken,
  writeStoredToken,
  tokenExpiringSoon,
  ensureTokenDir,
} from "./config.js";

const ACCOUNTS = "https://accounts.spotify.com";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_logged_in"
      | "refresh_failed"
      | "client_credentials_failed"
      | "missing_env"
  ) {
    super(message);
    this.name = "AuthError";
  }
}

async function tokenRequest(
  body: URLSearchParams,
  basicAuth?: { clientId: string; clientSecret: string }
): Promise<StoredToken> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (basicAuth) {
    const creds = Buffer.from(
      `${basicAuth.clientId}:${basicAuth.clientSecret}`
    ).toString("base64");
    headers.Authorization = `Basic ${creds}`;
  }

  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers,
    body,
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      `Token request failed (${res.status}): ${JSON.stringify(data)}`
    );
  }
  const expiresIn = Number(data.expires_in ?? 3600);
  return {
    access_token: String(data.access_token),
    token_type: String(data.token_type ?? "Bearer"),
    refresh_token:
      typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expires_at: Date.now() + expiresIn * 1000,
    scope: typeof data.scope === "string" ? data.scope : undefined,
  };
}

/** Client-credentials token for public/read-only endpoints. */
export async function getClientAccessToken(
  config: SpotifyConfig = loadConfig()
): Promise<string> {
  ensureTokenDir(config);
  const cached = readStoredToken(config.clientTokenFile);
  if (cached && !tokenExpiringSoon(cached)) {
    return cached.access_token;
  }

  try {
    const token = await tokenRequest(
      new URLSearchParams({ grant_type: "client_credentials" }),
      { clientId: config.clientId, clientSecret: config.clientSecret }
    );
    writeStoredToken(config.clientTokenFile, token);
    return token.access_token;
  } catch (err) {
    throw new AuthError(
      `Client credentials failed: ${err instanceof Error ? err.message : err}`,
      "client_credentials_failed"
    );
  }
}

async function refreshUserToken(
  config: SpotifyConfig,
  refreshToken: string
): Promise<StoredToken> {
  const token = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    { clientId: config.clientId, clientSecret: config.clientSecret }
  );
  // Spotify may omit refresh_token on refresh — keep the old one.
  if (!token.refresh_token) token.refresh_token = refreshToken;
  writeStoredToken(config.tokenFile, token);
  return token;
}

/** User access token from PKCE login; auto-refreshes. */
export async function getUserAccessToken(
  config: SpotifyConfig = loadConfig()
): Promise<string> {
  ensureTokenDir(config);
  const cached = readStoredToken(config.tokenFile);
  if (!cached?.refresh_token && !cached?.access_token) {
    throw new AuthError(
      "Not logged in. Run `npx spotify-aux login` (or `npm run login`) once to authorize Spotify.",
      "not_logged_in"
    );
  }

  if (cached && !tokenExpiringSoon(cached)) {
    return cached.access_token;
  }

  if (!cached?.refresh_token) {
    throw new AuthError(
      "User token expired and no refresh_token is stored. Run `npm run login` again.",
      "not_logged_in"
    );
  }

  try {
    const refreshed = await refreshUserToken(config, cached.refresh_token);
    return refreshed.access_token;
  } catch (err) {
    throw new AuthError(
      `Refresh failed — run \`npm run login\` again. Details: ${
        err instanceof Error ? err.message : err
      }`,
      "refresh_failed"
    );
  }
}

/**
 * Prefer user token when available (covers all endpoints);
 * fall back to client credentials for public data.
 */
export async function getAccessToken(
  prefer: "user" | "client" | "auto" = "auto",
  config: SpotifyConfig = loadConfig()
): Promise<{ token: string; mode: "user" | "client" }> {
  if (prefer === "client") {
    return { token: await getClientAccessToken(config), mode: "client" };
  }
  if (prefer === "user") {
    return { token: await getUserAccessToken(config), mode: "user" };
  }
  try {
    return { token: await getUserAccessToken(config), mode: "user" };
  } catch (err) {
    if (err instanceof AuthError && err.code === "not_logged_in") {
      return { token: await getClientAccessToken(config), mode: "client" };
    }
    throw err;
  }
}

export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  config: SpotifyConfig
): Promise<StoredToken> {
  const token = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: codeVerifier,
    }),
    // Confidential clients may also send Basic auth; Spotify accepts both with PKCE.
    { clientId: config.clientId, clientSecret: config.clientSecret }
  );
  writeStoredToken(config.tokenFile, token);
  return token;
}
