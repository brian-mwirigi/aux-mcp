/**
 * Catalog discovery — no vibe dictionary.
 * The host LLM (or caller) supplies search queries + optional audio targets.
 * We pull from Spotify's catalog: search, playlists, related artists, recommendations.
 */
import { spotify } from "./client.js";

export interface DiscoverOpts {
  /** Free-text vibe / request — also used as a search query. */
  text?: string;
  /** Extra search queries chosen by the LLM (genres, scenes, artists, eras). */
  search_queries?: string[];
  /** Prefer catalog exploration over recycling the user's library. Default true. */
  explore?: boolean;
  /** Soft cap on unique tracks returned. */
  limit?: number;
  /** Skip heavy personal-library seeding; prefer catalog / lower popularity. */
  anti_algorithm?: boolean;
}

export async function discoverCandidateTracks(
  opts: DiscoverOpts
): Promise<{ tracks: any[]; sources: Record<string, number> }> {
  const want = opts.limit ?? 120;
  const explore = opts.explore !== false;
  const anti = Boolean(opts.anti_algorithm);
  const tracks: any[] = [];
  const seen = new Set<string>();
  const sources: Record<string, number> = {};

  const push = (items: any[], source: string) => {
    let added = 0;
    for (const t of items) {
      if (!t?.id || seen.has(t.id)) continue;
      if (anti && (t.popularity ?? 0) >= 75) continue;
      seen.add(t.id);
      tracks.push(t);
      added++;
    }
    if (added) sources[source] = (sources[source] ?? 0) + added;
  };

  const queries = uniqueQueries([
    opts.text,
    ...(opts.search_queries ?? []),
    ...(anti
      ? ["underground mix", "deep cuts playlist", "obscure indie gems"]
      : []),
  ]);

  // Spotify Web API currently rejects search limit > 10 for many apps.
  const SEARCH_LIMIT = 10;

  // 1) Direct track search for each query (catalog, not library)
  if (explore) {
    for (const q of queries.slice(0, 8)) {
      try {
        const data = await spotify.get<any>("/search", {
          q,
          type: "track",
          limit: SEARCH_LIMIT,
        });
        push(data.tracks?.items ?? [], "search");
      } catch {
        /* */
      }
      if (tracks.length >= want) break;
    }
  }

  // 2) Playlist search → pull tracks from matching public playlists
  if (explore && tracks.length < want) {
    for (const q of queries.slice(0, 5)) {
      try {
        const data = await spotify.get<any>("/search", {
          q,
          type: "playlist",
          limit: Math.min(5, SEARCH_LIMIT),
        });
        const playlists = (data.playlists?.items ?? []).filter(Boolean);
        for (const pl of playlists.slice(0, 3)) {
          try {
            const page = await spotify.get<any>(`/playlists/${pl.id}/tracks`, {
              limit: 50,
            });
            push(
              (page.items ?? []).map((i: any) => i.track).filter(Boolean),
              "playlist_search"
            );
          } catch {
            /* private / gone */
          }
          if (tracks.length >= want) break;
        }
      } catch {
        /* */
      }
      if (tracks.length >= want) break;
    }
  }

  // 3) Related artists from search hits + user top artists → their top tracks
  const artistIds = new Set<string>();
  for (const t of tracks.slice(0, 40)) {
    for (const a of t.artists ?? []) {
      if (a?.id) artistIds.add(a.id);
    }
  }
  try {
    const topArtists = await spotify.get<any>(
      "/me/top/artists",
      { time_range: "medium_term", limit: 8 },
      "user"
    );
    for (const a of topArtists.items ?? []) artistIds.add(a.id);
  } catch {
    /* */
  }

  const seedArtists = [...artistIds].slice(0, 8);
  if (explore) {
    for (const id of seedArtists.slice(0, 5)) {
      try {
        const rel = await spotify.get<any>(`/artists/${id}/related-artists`);
        for (const a of (rel.artists ?? []).slice(0, 3)) {
          artistIds.add(a.id);
        }
      } catch {
        /* related-artists sometimes restricted */
      }
    }
  }

  for (const id of [...artistIds].slice(0, 12)) {
    try {
      const top = await spotify.get<any>(`/artists/${id}/top-tracks`, {
        market: "US",
      });
      push(top.tracks ?? [], "artist_top");
    } catch {
      /* */
    }
    if (tracks.length >= want) break;
  }

  // 4) Official recommendations if the app still has access
  if (explore && tracks.length < want) {
    try {
      const seed_tracks = tracks
        .slice(0, 2)
        .map((t) => t.id)
        .filter(Boolean);
      const seed_artists = seedArtists.slice(0, 3);
      if (seed_tracks.length + seed_artists.length > 0) {
        const data = await spotify.get<any>("/recommendations", {
          seed_tracks: seed_tracks.join(",") || undefined,
          seed_artists: seed_artists.slice(0, 5 - seed_tracks.length).join(",") || undefined,
          limit: 30,
        });
        push(data.tracks ?? [], "recommendations");
      }
    } catch {
      /* deprecated / restricted — fine */
    }
  }

  // 5) Personal library as seasoning (skip / shrink in anti-algorithm mode)
  if (!anti) {
    try {
      const top = await spotify.get<any>(
        "/me/top/tracks",
        { time_range: "medium_term", limit: 20 },
        "user"
      );
      push(top.items ?? [], "library_top");
    } catch {
      /* */
    }
    try {
      const saved = await spotify.get<any>("/me/tracks", { limit: 20 }, "user");
      push(
        (saved.items ?? []).map((i: any) => i.track),
        "library_saved"
      );
    } catch {
      /* */
    }
  }

  return { tracks: tracks.slice(0, want), sources };
}

function uniqueQueries(raw: Array<string | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const q of raw) {
    const t = (q ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
