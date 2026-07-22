import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spotify } from "../client.js";
import { ok, fail, toTrackUri, summarizeTrack } from "../format.js";

const deviceId = z
  .string()
  .optional()
  .describe("Target Spotify device ID (from get_devices)");

export function registerPlaybackTools(server: McpServer) {
  server.registerTool(
    "get_current_playback",
    {
      description:
        "Get full playback state (device, shuffle, repeat, progress, current item). Requires user auth + active device.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await spotify.get<any>("/me/player", undefined, "user");
        if (!data) return ok({ is_playing: false, message: "No active playback" });
        return ok({
          is_playing: data.is_playing,
          progress_ms: data.progress_ms,
          shuffle_state: data.shuffle_state,
          repeat_state: data.repeat_state,
          device: data.device,
          context: data.context,
          item: summarizeTrack(data.item),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_currently_playing",
    {
      description: "Get the currently playing track. Requires user auth.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await spotify.get<any>(
          "/me/player/currently-playing",
          undefined,
          "user"
        );
        if (!data) return ok({ is_playing: false, item: null });
        return ok({
          is_playing: data.is_playing,
          progress_ms: data.progress_ms,
          item: summarizeTrack(data.item),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "play",
    {
      description:
        "Start/resume playback. Pass context_uri (album/playlist/artist) and/or track_uris. Requires Premium + active device.",
      inputSchema: {
        context_uri: z.string().optional(),
        track_uris: z.array(z.string()).optional(),
        device_id: deviceId,
        position_ms: z.number().int().min(0).optional(),
        offset_position: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Zero-based offset into context"),
      },
    },
    async ({ context_uri, track_uris, device_id, position_ms, offset_position }) => {
      try {
        const body: Record<string, unknown> = {};
        if (context_uri) body.context_uri = context_uri;
        if (track_uris?.length) {
          body.uris = track_uris.map(toTrackUri);
        }
        if (position_ms !== undefined) body.position_ms = position_ms;
        if (offset_position !== undefined) {
          body.offset = { position: offset_position };
        }
        await spotify.put(
          "/me/player/play",
          Object.keys(body).length ? body : undefined,
          { device_id },
          "user"
        );
        return ok({ ok: true, playing: true });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "pause",
    {
      description: "Pause playback on a device.",
      inputSchema: { device_id: deviceId },
    },
    async ({ device_id }) => {
      try {
        await spotify.put("/me/player/pause", undefined, { device_id }, "user");
        return ok({ ok: true, paused: true });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "next_track",
    {
      description: "Skip to next track.",
      inputSchema: { device_id: deviceId },
    },
    async ({ device_id }) => {
      try {
        await spotify.post("/me/player/next", undefined, { device_id }, "user");
        return ok({ ok: true });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "previous_track",
    {
      description: "Skip to previous track.",
      inputSchema: { device_id: deviceId },
    },
    async ({ device_id }) => {
      try {
        await spotify.post("/me/player/previous", undefined, { device_id }, "user");
        return ok({ ok: true });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "seek",
    {
      description: "Seek to position_ms in the currently playing track.",
      inputSchema: {
        position_ms: z.number().int().min(0),
        device_id: deviceId,
      },
    },
    async ({ position_ms, device_id }) => {
      try {
        await spotify.put(
          "/me/player/seek",
          undefined,
          { position_ms, device_id },
          "user"
        );
        return ok({ ok: true, position_ms });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "set_volume",
    {
      description: "Set playback volume (0-100). May be unsupported on some devices.",
      inputSchema: {
        percent: z.number().int().min(0).max(100),
        device_id: deviceId,
      },
    },
    async ({ percent, device_id }) => {
      try {
        await spotify.put(
          "/me/player/volume",
          undefined,
          { volume_percent: percent, device_id },
          "user"
        );
        return ok({ ok: true, volume_percent: percent });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "set_shuffle",
    {
      description: "Enable or disable shuffle.",
      inputSchema: {
        state: z.boolean(),
        device_id: deviceId,
      },
    },
    async ({ state, device_id }) => {
      try {
        await spotify.put(
          "/me/player/shuffle",
          undefined,
          { state, device_id },
          "user"
        );
        return ok({ ok: true, shuffle: state });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "set_repeat_mode",
    {
      description: "Set repeat mode: track, context, or off.",
      inputSchema: {
        mode: z.enum(["track", "context", "off"]),
        device_id: deviceId,
      },
    },
    async ({ mode, device_id }) => {
      try {
        await spotify.put(
          "/me/player/repeat",
          undefined,
          { state: mode, device_id },
          "user"
        );
        return ok({ ok: true, repeat: mode });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "add_to_queue",
    {
      description: "Add a track URI/ID to the playback queue.",
      inputSchema: {
        uri: z.string().min(1).describe("Track URI or ID"),
        device_id: deviceId,
      },
    },
    async ({ uri, device_id }) => {
      try {
        const trackUri = toTrackUri(uri);
        await spotify.post(
          "/me/player/queue",
          undefined,
          { uri: trackUri, device_id },
          "user"
        );
        return ok({ ok: true, queued: trackUri });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_queue",
    {
      description: "Get the current playback queue.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await spotify.get<any>("/me/player/queue", undefined, "user");
        return ok({
          currently_playing: summarizeTrack(data.currently_playing),
          queue: (data.queue ?? []).map(summarizeTrack),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_devices",
    {
      description: "List available Spotify Connect devices.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await spotify.get<any>("/me/player/devices", undefined, "user");
        return ok({ devices: data.devices ?? [] });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "transfer_playback",
    {
      description: "Transfer playback to a device. Optionally start playing.",
      inputSchema: {
        device_id: z.string().min(1),
        play: z.boolean().optional().describe("Start playing after transfer"),
      },
    },
    async ({ device_id, play }) => {
      try {
        await spotify.put(
          "/me/player",
          { device_ids: [device_id], play: play ?? false },
          undefined,
          "user"
        );
        return ok({ ok: true, device_id, play: play ?? false });
      } catch (e) {
        return fail(e);
      }
    }
  );
}
