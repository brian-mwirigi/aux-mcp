import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spotify } from "../client.js";
import {
  ok,
  fail,
  extractId,
  toTrackUri,
  summarizePlaylist,
} from "../format.js";

export function registerPlaylistTools(server: McpServer) {
  server.registerTool(
    "get_my_playlists",
    {
      description: "List the current user's playlists. Requires user auth.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async ({ limit, offset }) => {
      try {
        const data = await spotify.get<any>(
          "/me/playlists",
          { limit: limit ?? 20, offset: offset ?? 0 },
          "user"
        );
        return ok({
          playlists: (data.items ?? []).map(summarizePlaylist),
          total: data.total,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "create_playlist",
    {
      description: "Create a new playlist for the current user.",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        public: z.boolean().optional(),
      },
    },
    async ({ name, description, public: isPublic }) => {
      try {
        const me = await spotify.get<any>("/me", undefined, "user");
        const data = await spotify.post(
          `/users/${me.id}/playlists`,
          {
            name,
            description: description ?? "",
            public: isPublic ?? false,
          },
          undefined,
          "user"
        );
        return ok(summarizePlaylist(data));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "add_tracks_to_playlist",
    {
      description: "Add tracks to a playlist.",
      inputSchema: {
        playlist_id: z.string().min(1),
        track_uris: z.array(z.string()).min(1).max(100),
        position: z.number().int().min(0).optional(),
      },
    },
    async ({ playlist_id, track_uris, position }) => {
      try {
        const id = extractId(playlist_id, "playlist");
        const uris = track_uris.map(toTrackUri);
        const data = await spotify.post(
          `/playlists/${id}/tracks`,
          { uris, position },
          undefined,
          "user"
        );
        return ok({ ok: true, snapshot_id: (data as any)?.snapshot_id, added: uris.length });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "remove_tracks_from_playlist",
    {
      description: "Remove tracks from a playlist.",
      inputSchema: {
        playlist_id: z.string().min(1),
        track_uris: z.array(z.string()).min(1).max(100),
      },
    },
    async ({ playlist_id, track_uris }) => {
      try {
        const id = extractId(playlist_id, "playlist");
        const tracks = track_uris.map((u) => ({ uri: toTrackUri(u) }));
        const data = await spotify.delete(
          `/playlists/${id}/tracks`,
          { tracks },
          undefined,
          "user"
        );
        return ok({
          ok: true,
          snapshot_id: (data as any)?.snapshot_id,
          removed: tracks.length,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "reorder_playlist_items",
    {
      description:
        "Reorder items in a playlist. Moves range_start..range_start+range_length to insert_before.",
      inputSchema: {
        playlist_id: z.string().min(1),
        range_start: z.number().int().min(0),
        insert_before: z.number().int().min(0),
        range_length: z.number().int().min(1).optional(),
      },
    },
    async ({ playlist_id, range_start, insert_before, range_length }) => {
      try {
        const id = extractId(playlist_id, "playlist");
        const data = await spotify.put(
          `/playlists/${id}/tracks`,
          {
            range_start,
            insert_before,
            range_length: range_length ?? 1,
          },
          undefined,
          "user"
        );
        return ok({ ok: true, snapshot_id: (data as any)?.snapshot_id });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "update_playlist_details",
    {
      description: "Update playlist name, description, and/or public flag.",
      inputSchema: {
        playlist_id: z.string().min(1),
        name: z.string().optional(),
        description: z.string().optional(),
        public: z.boolean().optional(),
      },
    },
    async ({ playlist_id, name, description, public: isPublic }) => {
      try {
        const id = extractId(playlist_id, "playlist");
        const body: Record<string, unknown> = {};
        if (name !== undefined) body.name = name;
        if (description !== undefined) body.description = description;
        if (isPublic !== undefined) body.public = isPublic;
        if (!Object.keys(body).length) {
          return fail("Provide at least one of name, description, public.");
        }
        await spotify.put(`/playlists/${id}`, body, undefined, "user");
        return ok({ ok: true, playlist_id: id, ...body });
      } catch (e) {
        return fail(e);
      }
    }
  );
}
