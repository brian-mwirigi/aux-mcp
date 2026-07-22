import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spotify } from "../client.js";
import {
  ok,
  fail,
  extractId,
  summarizeTrack,
  summarizeArtist,
} from "../format.js";

const timeRange = z
  .enum([
    "short",
    "medium",
    "long",
    "short_term",
    "medium_term",
    "long_term",
  ])
  .optional()
  .describe("short|medium|long (≈4 weeks / 6 months / years)");

function normalizeTimeRange(
  value?: string
): "short_term" | "medium_term" | "long_term" {
  if (!value || value === "medium" || value === "medium_term") return "medium_term";
  if (value === "short" || value === "short_term") return "short_term";
  return "long_term";
}

export function registerPersonalizationTools(server: McpServer) {
  server.registerTool(
    "get_top_tracks",
    {
      description: "Get the user's top tracks for a time range.",
      inputSchema: {
        time_range: timeRange,
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ time_range, limit }) => {
      try {
        const range = normalizeTimeRange(time_range);
        const data = await spotify.get<any>(
          "/me/top/tracks",
          { time_range: range, limit: limit ?? 20 },
          "user"
        );
        return ok({
          time_range: range,
          tracks: (data.items ?? []).map(summarizeTrack),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_top_artists",
    {
      description: "Get the user's top artists for a time range.",
      inputSchema: {
        time_range: timeRange,
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ time_range, limit }) => {
      try {
        const range = normalizeTimeRange(time_range);
        const data = await spotify.get<any>(
          "/me/top/artists",
          { time_range: range, limit: limit ?? 20 },
          "user"
        );
        return ok({
          time_range: range,
          artists: (data.items ?? []).map(summarizeArtist),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_recently_played",
    {
      description: "Get the user's recently played tracks.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ limit }) => {
      try {
        const data = await spotify.get<any>(
          "/me/player/recently-played",
          { limit: limit ?? 20 },
          "user"
        );
        return ok({
          items: (data.items ?? []).map((i: any) => ({
            played_at: i.played_at,
            track: summarizeTrack(i.track),
          })),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_followed_artists",
    {
      description: "Get artists the user follows.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ limit }) => {
      try {
        const data = await spotify.get<any>(
          "/me/following",
          { type: "artist", limit: limit ?? 20 },
          "user"
        );
        return ok({
          artists: (data.artists?.items ?? []).map(summarizeArtist),
          total: data.artists?.total,
          next: data.artists?.cursors?.after,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "follow_artist",
    {
      description: "Follow an artist.",
      inputSchema: { artist_id: z.string().min(1) },
    },
    async ({ artist_id }) => {
      try {
        const id = extractId(artist_id, "artist");
        await spotify.put(
          "/me/following",
          { ids: [id] },
          { type: "artist" },
          "user"
        );
        return ok({ ok: true, followed: id });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "unfollow_artist",
    {
      description: "Unfollow an artist.",
      inputSchema: { artist_id: z.string().min(1) },
    },
    async ({ artist_id }) => {
      try {
        const id = extractId(artist_id, "artist");
        await spotify.delete(
          "/me/following",
          { ids: [id] },
          { type: "artist" },
          "user"
        );
        return ok({ ok: true, unfollowed: id });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "check_following_artist",
    {
      description: "Check if the user follows an artist.",
      inputSchema: { artist_id: z.string().min(1) },
    },
    async ({ artist_id }) => {
      try {
        const id = extractId(artist_id, "artist");
        const flags = await spotify.get<boolean[]>(
          "/me/following/contains",
          { type: "artist", ids: id },
          "user"
        );
        return ok({ artist_id: id, following: flags[0] ?? false });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_user_profile",
    {
      description: "Get the current user's Spotify profile.",
      inputSchema: {},
    },
    async () => {
      try {
        const me = await spotify.get<any>("/me", undefined, "user");
        return ok({
          id: me.id,
          display_name: me.display_name,
          email: me.email,
          country: me.country,
          product: me.product,
          followers: me.followers?.total,
          images: me.images,
          external_url: me.external_urls?.spotify,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );
}
