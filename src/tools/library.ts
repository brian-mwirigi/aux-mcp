import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spotify } from "../client.js";
import {
  ok,
  fail,
  extractIds,
  summarizeTrack,
  summarizeAlbum,
} from "../format.js";

export function registerLibraryTools(server: McpServer) {
  server.registerTool(
    "get_saved_tracks",
    {
      description: "Get the user's saved/liked tracks.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async ({ limit, offset }) => {
      try {
        const data = await spotify.get<any>(
          "/me/tracks",
          { limit: limit ?? 20, offset: offset ?? 0 },
          "user"
        );
        return ok({
          tracks: (data.items ?? []).map((i: any) => ({
            added_at: i.added_at,
            ...summarizeTrack(i.track),
          })),
          total: data.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "save_tracks",
    {
      description: "Save tracks to the user's library.",
      inputSchema: {
        track_ids: z.array(z.string()).min(1).max(50),
      },
    },
    async ({ track_ids }) => {
      try {
        const ids = extractIds(track_ids, "track");
        await spotify.put("/me/tracks", { ids }, undefined, "user");
        return ok({ ok: true, saved: ids });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "remove_saved_tracks",
    {
      description: "Remove tracks from the user's library.",
      inputSchema: {
        track_ids: z.array(z.string()).min(1).max(50),
      },
    },
    async ({ track_ids }) => {
      try {
        const ids = extractIds(track_ids, "track");
        await spotify.delete("/me/tracks", { ids }, undefined, "user");
        return ok({ ok: true, removed: ids });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "check_saved_tracks",
    {
      description: "Check whether tracks are saved in the user's library.",
      inputSchema: {
        track_ids: z.array(z.string()).min(1).max(50),
      },
    },
    async ({ track_ids }) => {
      try {
        const ids = extractIds(track_ids, "track");
        const flags = await spotify.get<boolean[]>(
          "/me/tracks/contains",
          { ids: ids.join(",") },
          "user"
        );
        return ok(
          ids.map((id, i) => ({ track_id: id, saved: flags[i] ?? false }))
        );
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_saved_albums",
    {
      description: "Get the user's saved albums.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async ({ limit, offset }) => {
      try {
        const data = await spotify.get<any>(
          "/me/albums",
          { limit: limit ?? 20, offset: offset ?? 0 },
          "user"
        );
        return ok({
          albums: (data.items ?? []).map((i: any) => ({
            added_at: i.added_at,
            ...summarizeAlbum(i.album),
          })),
          total: data.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "save_albums",
    {
      description: "Save albums to the user's library.",
      inputSchema: {
        album_ids: z.array(z.string()).min(1).max(50),
      },
    },
    async ({ album_ids }) => {
      try {
        const ids = extractIds(album_ids, "album");
        await spotify.put("/me/albums", { ids }, undefined, "user");
        return ok({ ok: true, saved: ids });
      } catch (e) {
        return fail(e);
      }
    }
  );
}
