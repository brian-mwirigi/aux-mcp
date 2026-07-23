import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spotify } from "../client.js";
import {
  ok,
  fail,
  extractId,
  extractIds,
  summarizeTrack,
  summarizeArtist,
  summarizeAlbum,
  summarizePlaylist,
} from "../format.js";

// Spotify search currently rejects limit > 10 for many apps.
const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(10)
  .optional()
  .describe("Max results (1-10)");

function searchLimit(limit?: number) {
  return Math.min(10, Math.max(1, limit ?? 10));
}

export function registerSearchBrowseTools(server: McpServer) {
  server.registerTool(
    "search_tracks",
    {
      description: "Search Spotify for tracks (read-only).",
      inputSchema: { query: z.string().min(1), limit: limitSchema },
    },
    async ({ query, limit }) => {
      try {
        const data = await spotify.get<any>("/search", {
          q: query,
          type: "track",
          limit: searchLimit(limit),
        });
        return ok({
          tracks: (data.tracks?.items ?? []).map(summarizeTrack),
          total: data.tracks?.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "search_artists",
    {
      description: "Search Spotify for artists (read-only).",
      inputSchema: { query: z.string().min(1), limit: limitSchema },
    },
    async ({ query, limit }) => {
      try {
        const data = await spotify.get<any>("/search", {
          q: query,
          type: "artist",
          limit: searchLimit(limit),
        });
        return ok({
          artists: (data.artists?.items ?? []).map(summarizeArtist),
          total: data.artists?.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "search_albums",
    {
      description: "Search Spotify for albums (read-only).",
      inputSchema: { query: z.string().min(1), limit: limitSchema },
    },
    async ({ query, limit }) => {
      try {
        const data = await spotify.get<any>("/search", {
          q: query,
          type: "album",
          limit: searchLimit(limit),
        });
        return ok({
          albums: (data.albums?.items ?? []).map(summarizeAlbum),
          total: data.albums?.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "search_playlists",
    {
      description: "Search Spotify for playlists (read-only).",
      inputSchema: { query: z.string().min(1), limit: limitSchema },
    },
    async ({ query, limit }) => {
      try {
        const data = await spotify.get<any>("/search", {
          q: query,
          type: "playlist",
          limit: searchLimit(limit),
        });
        return ok({
          playlists: (data.playlists?.items ?? [])
            .filter(Boolean)
            .map(summarizePlaylist),
          total: data.playlists?.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_track",
    {
      description: "Get a track by ID, URI, or Spotify URL.",
      inputSchema: { track_id: z.string().min(1) },
    },
    async ({ track_id }) => {
      try {
        const id = extractId(track_id, "track");
        const data = await spotify.get(`/tracks/${id}`);
        return ok(summarizeTrack(data));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_artist",
    {
      description: "Get an artist by ID, URI, or Spotify URL.",
      inputSchema: { artist_id: z.string().min(1) },
    },
    async ({ artist_id }) => {
      try {
        const id = extractId(artist_id, "artist");
        const data = await spotify.get(`/artists/${id}`);
        return ok(summarizeArtist(data));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_artist_top_tracks",
    {
      description: "Get an artist's top tracks for a market (ISO country code).",
      inputSchema: {
        artist_id: z.string().min(1),
        market: z
          .string()
          .length(2)
          .optional()
          .describe("ISO 3166-1 alpha-2 market, default US"),
      },
    },
    async ({ artist_id, market }) => {
      try {
        const id = extractId(artist_id, "artist");
        const data = await spotify.get<any>(`/artists/${id}/top-tracks`, {
          market: market ?? "US",
        });
        return ok({ tracks: (data.tracks ?? []).map(summarizeTrack) });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_artist_albums",
    {
      description: "Get albums for an artist.",
      inputSchema: {
        artist_id: z.string().min(1),
        limit: limitSchema,
        include_groups: z
          .string()
          .optional()
          .describe("Comma list: album,single,appears_on,compilation"),
      },
    },
    async ({ artist_id, limit, include_groups }) => {
      try {
        const id = extractId(artist_id, "artist");
        const data = await spotify.get<any>(`/artists/${id}/albums`, {
          limit: limit ?? 20,
          include_groups: include_groups ?? "album,single",
        });
        return ok({
          albums: (data.items ?? []).map(summarizeAlbum),
          total: data.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_album",
    {
      description: "Get an album by ID, URI, or Spotify URL.",
      inputSchema: { album_id: z.string().min(1) },
    },
    async ({ album_id }) => {
      try {
        const id = extractId(album_id, "album");
        const data = await spotify.get(`/albums/${id}`);
        return ok(summarizeAlbum(data));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_album_tracks",
    {
      description: "Get tracks on an album.",
      inputSchema: { album_id: z.string().min(1), limit: limitSchema },
    },
    async ({ album_id, limit }) => {
      try {
        const id = extractId(album_id, "album");
        const data = await spotify.get<any>(`/albums/${id}/tracks`, {
          limit: limit ?? 50,
        });
        return ok({
          tracks: (data.items ?? []).map(summarizeTrack),
          total: data.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_playlist",
    {
      description: "Get a playlist by ID, URI, or Spotify URL.",
      inputSchema: { playlist_id: z.string().min(1) },
    },
    async ({ playlist_id }) => {
      try {
        const id = extractId(playlist_id, "playlist");
        const data = await spotify.get(`/playlists/${id}`);
        return ok(summarizePlaylist(data));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_playlist_tracks",
    {
      description: "Get tracks in a playlist.",
      inputSchema: {
        playlist_id: z.string().min(1),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async ({ playlist_id, limit, offset }) => {
      try {
        const id = extractId(playlist_id, "playlist");
        const data = await spotify.get<any>(`/playlists/${id}/tracks`, {
          limit: limit ?? 50,
          offset: offset ?? 0,
        });
        return ok({
          tracks: (data.items ?? [])
            .map((i: any) => summarizeTrack(i.track))
            .filter(Boolean),
          total: data.total,
          next: data.next,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_recommendations",
    {
      description:
        "Get track recommendations from seeds (tracks/artists/genres). Note: Spotify has restricted this endpoint for some apps — if it fails, use set_mood instead.",
      inputSchema: {
        seed_tracks: z.array(z.string()).optional(),
        seed_artists: z.array(z.string()).optional(),
        seed_genres: z.array(z.string()).optional(),
        limit: limitSchema,
        target_energy: z.number().min(0).max(1).optional(),
        target_valence: z.number().min(0).max(1).optional(),
        target_tempo: z.number().min(40).max(220).optional(),
      },
    },
    async (args) => {
      try {
        const seed_tracks = extractIds(args.seed_tracks ?? [], "track").slice(0, 5);
        const seed_artists = extractIds(args.seed_artists ?? [], "artist").slice(0, 5);
        const seed_genres = (args.seed_genres ?? []).slice(0, 5);
        const seedCount = seed_tracks.length + seed_artists.length + seed_genres.length;
        if (seedCount === 0) {
          return fail("Provide at least one of seed_tracks, seed_artists, or seed_genres.");
        }
        if (seedCount > 5) {
          return fail("Spotify allows at most 5 seeds total across tracks/artists/genres.");
        }
        const data = await spotify.get<any>("/recommendations", {
          seed_tracks: seed_tracks.join(",") || undefined,
          seed_artists: seed_artists.join(",") || undefined,
          seed_genres: seed_genres.join(",") || undefined,
          limit: args.limit ?? 20,
          target_energy: args.target_energy,
          target_valence: args.target_valence,
          target_tempo: args.target_tempo,
        });
        return ok({
          seeds: data.seeds,
          tracks: (data.tracks ?? []).map(summarizeTrack),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_audio_features",
    {
      description:
        "Get audio features for a track (energy, valence, tempo, danceability, etc.).",
      inputSchema: { track_id: z.string().min(1) },
    },
    async ({ track_id }) => {
      try {
        const id = extractId(track_id, "track");
        const data = await spotify.get(`/audio-features/${id}`);
        return ok(data);
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_several_audio_features",
    {
      description: "Get audio features for up to 100 tracks.",
      inputSchema: {
        track_ids: z.array(z.string()).min(1).max(100),
      },
    },
    async ({ track_ids }) => {
      try {
        const ids = extractIds(track_ids, "track");
        const data = await spotify.get<any>("/audio-features", {
          ids: ids.join(","),
        });
        return ok({ audio_features: data.audio_features });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_new_releases",
    {
      description: "Get new album releases.",
      inputSchema: {
        limit: limitSchema,
        country: z.string().length(2).optional(),
      },
    },
    async ({ limit, country }) => {
      try {
        const data = await spotify.get<any>("/browse/new-releases", {
          limit: limit ?? 20,
          country,
        });
        return ok({
          albums: (data.albums?.items ?? []).map(summarizeAlbum),
          total: data.albums?.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_categories",
    {
      description: "Get browse categories.",
      inputSchema: {
        limit: limitSchema,
        country: z.string().length(2).optional(),
        locale: z.string().optional(),
      },
    },
    async ({ limit, country, locale }) => {
      try {
        const data = await spotify.get<any>("/browse/categories", {
          limit: limit ?? 20,
          country,
          locale,
        });
        return ok({
          categories: (data.categories?.items ?? []).map((c: any) => ({
            id: c.id,
            name: c.name,
            icons: c.icons,
          })),
          total: data.categories?.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_featured_playlists",
    {
      description: "Get featured/editorial playlists for a market.",
      inputSchema: {
        limit: limitSchema,
        country: z.string().length(2).optional(),
      },
    },
    async ({ limit, country }) => {
      try {
        const data = await spotify.get<any>("/browse/featured-playlists", {
          limit: limit ?? 20,
          country,
        });
        return ok({
          message: data.message,
          playlists: (data.playlists?.items ?? [])
            .filter(Boolean)
            .map(summarizePlaylist),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );
}
