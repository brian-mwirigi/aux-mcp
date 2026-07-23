/** Helpers for consistent MCP tool responses. */

export function ok(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

/** Card-first response — ASCII share card on top, JSON payload under it. */
export function okCard(card: string, data?: unknown) {
  const parts: Array<{ type: "text"; text: string }> = [
    { type: "text", text: card },
  ];
  if (data !== undefined) {
    parts.push({
      type: "text",
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
    });
  }
  return { content: parts };
}

export function fail(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

/** Compact track summary for LLM-friendly payloads. */
export function summarizeTrack(t: any) {
  if (!t) return null;
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists ?? []).map((a: any) => ({ id: a.id, name: a.name })),
    album: t.album
      ? { id: t.album.id, name: t.album.name, images: t.album.images }
      : undefined,
    duration_ms: t.duration_ms,
    explicit: t.explicit,
    popularity: t.popularity,
    preview_url: t.preview_url,
    external_url: t.external_urls?.spotify,
  };
}

export function summarizeArtist(a: any) {
  if (!a) return null;
  return {
    id: a.id,
    uri: a.uri,
    name: a.name,
    genres: a.genres,
    popularity: a.popularity,
    followers: a.followers?.total,
    images: a.images,
    external_url: a.external_urls?.spotify,
  };
}

export function summarizeAlbum(a: any) {
  if (!a) return null;
  return {
    id: a.id,
    uri: a.uri,
    name: a.name,
    artists: (a.artists ?? []).map((x: any) => ({ id: x.id, name: x.name })),
    release_date: a.release_date,
    total_tracks: a.total_tracks,
    album_type: a.album_type,
    images: a.images,
    external_url: a.external_urls?.spotify,
  };
}

export function summarizePlaylist(p: any) {
  if (!p) return null;
  return {
    id: p.id,
    uri: p.uri,
    name: p.name,
    description: p.description,
    owner: p.owner
      ? { id: p.owner.id, display_name: p.owner.display_name }
      : undefined,
    public: p.public,
    collaborative: p.collaborative,
    tracks_total: p.tracks?.total ?? p.tracks?.items?.length,
    images: p.images,
    external_url: p.external_urls?.spotify,
  };
}

/** Accept raw Spotify IDs or full URIs/URLs and return a bare ID. */
export function extractId(value: string, kind?: string): string {
  const v = value.trim();
  if (!v.includes(":") && !v.includes("/")) return v;
  // spotify:track:xxx
  const uriMatch = v.match(
    new RegExp(`spotify:${kind ? kind : "[a-z]+"}:([a-zA-Z0-9]+)`)
  );
  if (uriMatch) return uriMatch[1];
  // https://open.spotify.com/track/xxx
  const urlMatch = v.match(
    new RegExp(`open\\.spotify\\.com/${kind ? kind : "[a-z]+"}/([a-zA-Z0-9]+)`)
  );
  if (urlMatch) return urlMatch[1];
  // fallback: last path segment before query
  const parts = v.split("?")[0].split("/");
  return parts[parts.length - 1] || v;
}

export function extractIds(values: string[], kind?: string): string[] {
  return values.map((v) => extractId(v, kind));
}

export function toTrackUri(idOrUri: string): string {
  if (idOrUri.startsWith("spotify:track:")) return idOrUri;
  return `spotify:track:${extractId(idOrUri, "track")}`;
}
