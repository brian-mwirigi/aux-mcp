import { getAccessToken, AuthError } from "./auth.js";

const API = "https://api.spotify.com/v1";

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

export type AuthMode = "user" | "client" | "auto";

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  auth?: AuthMode;
  /** Return null instead of throwing on 204 / empty body. */
  allowEmpty?: boolean;
}

function buildQuery(
  query?: RequestOptions["query"]
): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export class SpotifyClient {
  async request<T = unknown>(
    path: string,
    opts: RequestOptions = {}
  ): Promise<T> {
    const auth = opts.auth ?? "auto";
    const { token } = await getAccessToken(auth);
    const url = `${API}${path}${buildQuery(opts.query)}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    let body: string | undefined;
    if (opts.body !== undefined && opts.body !== null) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    const res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body,
    });

    if (res.status === 204 || res.status === 202) {
      return null as T;
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const msg =
        typeof data === "object" && data && "error" in data
          ? JSON.stringify((data as any).error)
          : text || res.statusText;
      if (res.status === 401 || res.status === 403) {
        throw new SpotifyApiError(
          `Spotify ${res.status}: ${msg}. If this needs user scopes, run \`npm run login\`.`,
          res.status,
          data
        );
      }
      throw new SpotifyApiError(`Spotify ${res.status}: ${msg}`, res.status, data);
    }

    if ((data === null || data === "") && opts.allowEmpty) {
      return null as T;
    }
    return data as T;
  }

  get<T = unknown>(path: string, query?: RequestOptions["query"], auth?: AuthMode) {
    return this.request<T>(path, { method: "GET", query, auth });
  }

  post<T = unknown>(
    path: string,
    body?: unknown,
    query?: RequestOptions["query"],
    auth?: AuthMode
  ) {
    return this.request<T>(path, { method: "POST", body, query, auth });
  }

  put<T = unknown>(
    path: string,
    body?: unknown,
    query?: RequestOptions["query"],
    auth?: AuthMode
  ) {
    return this.request<T>(path, { method: "PUT", body, query, auth });
  }

  delete<T = unknown>(
    path: string,
    body?: unknown,
    query?: RequestOptions["query"],
    auth?: AuthMode
  ) {
    return this.request<T>(path, { method: "DELETE", body, query, auth });
  }
}

export const spotify = new SpotifyClient();

export function requireUserAuthMessage(err: unknown): string {
  if (err instanceof AuthError) return err.message;
  if (err instanceof SpotifyApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
