import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spotify } from "../client.js";
import {
  ok,
  fail,
  extractId,
  toTrackUri,
  summarizeTrack,
  okCard,
} from "../format.js";
import {
  runMoodQueue,
  fetchAudioFeatures,
  computeTasteStats,
} from "../mood-engine.js";
import {
  vibeCard,
  dnaCard,
  weeklyCard,
  partyCard,
  archetypeFromStats,
} from "../cards.js";
import { getAmbientContext } from "../context.js";
import {
  startAutoDj,
  stopAutoDj,
  tickAutoDj,
  loadAutoDj,
} from "../autodj.js";
import {
  createRoom,
  loadRoom,
  roomAdd,
  roomVote,
  pullRemoteRoom,
  pushRemoteRoom,
  saveRoom,
} from "../rooms.js";

export function registerPeakTools(server: McpServer) {
  server.registerTool(
    "context_vibe",
    {
      title: "Context Vibe",
      description:
        "HOOK: DJ from the room — local time + optional weather (wttr.in). Returns ambient context and plays a matching queue. Pass extra search_queries to steer.",
      inputSchema: {
        weather: z.boolean().optional().describe("Fetch weather (default true)"),
        location: z.string().optional().describe("City for weather, e.g. Nairobi"),
        search_queries: z.array(z.string()).optional(),
        anti_algorithm: z.boolean().optional(),
        play: z.boolean().optional(),
        device_id: z.string().optional(),
        limit: z.number().int().min(1).max(30).optional(),
      },
    },
    async (args) => {
      try {
        const ctx = await getAmbientContext({
          weather: args.weather,
          location: args.location,
        });
        const queries = [
          ...ctx.suggested_queries,
          ...(args.search_queries ?? []),
        ].slice(0, 8);
        const result = await runMoodQueue({
          text: ctx.blurb,
          search_queries: queries,
          energy: ctx.suggested_targets.energy,
          valence: ctx.suggested_targets.valence,
          tempo: ctx.suggested_targets.tempo,
          anti_algorithm: args.anti_algorithm,
          play: args.play,
          device_id: args.device_id,
          limit: args.limit ?? 12,
          label: ctx.blurb,
          explore: true,
        });
        const card = vibeCard({
          label: ctx.blurb,
          blurb: queries.slice(0, 3).join(" · "),
          energy: ctx.suggested_targets.energy,
          valence: ctx.suggested_targets.valence,
          tempo: ctx.suggested_targets.tempo,
          tracks: result.matched,
        });
        return okCard(card, { context: ctx, ...result });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "weekly_report",
    {
      title: "Weekly Report",
      description:
        "HOOK: Your week in music — DNA archetype, top tracks, one roast line. Screenshot bait / Sunday share.",
      inputSchema: {
        time_range: z
          .enum(["short_term", "medium_term", "long_term"])
          .optional()
          .describe("short_term ≈ last 4 weeks"),
      },
    },
    async ({ time_range }) => {
      try {
        const range = time_range ?? "short_term";
        const top = await spotify.get<any>(
          "/me/top/tracks",
          { time_range: range, limit: 20 },
          "user"
        );
        const tracks = top.items ?? [];
        if (!tracks.length) return fail("No top tracks yet — listen more, come back.");
        const features = await fetchAudioFeatures(tracks.map((t: any) => t.id));
        const stats = computeTasteStats(tracks, features);
        const archetype = archetypeFromStats(stats);
        const roast_line =
          stats.avg_popularity > 70
            ? "The algorithm could file your taxes."
            : stats.avg_valence < 0.35
              ? "This week was a weather advisory."
              : stats.avg_energy > 0.7
                ? "You treated calm like a personal insult."
                : "Professionally mid. Iconic in its own way.";
        const week_label =
          range === "short_term"
            ? "last ~4 weeks"
            : range === "medium_term"
              ? "last ~6 months"
              : "all-time energy";
        const topNames = tracks
          .slice(0, 5)
          .map(
            (t: any) =>
              `${t.name} — ${(t.artists ?? []).map((a: any) => a.name).join(", ")}`
          );
        const card = weeklyCard({
          week_label,
          archetype,
          top_tracks: topNames,
          roast_line,
          stats,
        });
        const dna = dnaCard({
          title: `Weekly · ${week_label}`,
          stats,
          archetype,
        });
        return okCard(`${card}\n\n${dna}`, {
          week_label,
          archetype,
          roast_line,
          stats,
          top_tracks: tracks.slice(0, 10).map(summarizeTrack),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "auto_dj_start",
    {
      title: "Auto-DJ Start",
      description:
        "HOOK: Start an Auto-DJ session. Keeps refilling the queue when tracks run low. Call auto_dj_tick periodically (or run `npx aux-mcp autodj`).",
      inputSchema: {
        text: z.string().min(1),
        search_queries: z.array(z.string()).min(1).max(8),
        energy: z.number().min(0).max(1),
        valence: z.number().min(0).max(1),
        tempo: z.number().min(40).max(220),
        anti_algorithm: z.boolean().optional(),
        device_id: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const session = startAutoDj({
          text: args.text,
          search_queries: args.search_queries,
          energy: args.energy,
          valence: args.valence,
          tempo: args.tempo,
          anti_algorithm: args.anti_algorithm,
          device_id: args.device_id,
        });
        const tick = await tickAutoDj();
        return ok({
          ok: true,
          message: "Auto-DJ on. Run auto_dj_tick every ~30s, or `npx aux-mcp autodj`.",
          session,
          tick,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "auto_dj_tick",
    {
      description:
        "HOOK: Check Auto-DJ — if near end of track / nothing playing, refill queue from the session vibe.",
      inputSchema: {
        threshold_ms: z.number().int().min(5000).max(60000).optional(),
      },
    },
    async ({ threshold_ms }) => {
      try {
        const result = await tickAutoDj(threshold_ms);
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "auto_dj_stop",
    {
      description: "Stop the Auto-DJ session.",
    },
    async () => {
      stopAutoDj();
      return ok({ ok: true, active: false });
    }
  );

  server.registerTool(
    "auto_dj_status",
    {
      description: "Show Auto-DJ session state.",
    },
    async () => ok({ session: loadAutoDj() })
  );

  server.registerTool(
    "party_room_create",
    {
      title: "Party Room Create",
      description:
        "HOOK: Create a shareable party room code for friends. Host `npx aux-mcp party-host` + tunnel; friends set AUX_PARTY_RELAY.",
      inputSchema: { name: z.string().optional() },
    },
    async ({ name }) => {
      try {
        const room = createRoom(name);
        await pushRemoteRoom(room);
        const card = partyCard({
          open: room.open,
          top: room.suggestions.map((t) => ({
            name: t.name,
            votes: t.votes,
            artists: t.artists,
          })),
        });
        const linkHint = process.env.AUX_PARTY_RELAY
          ? `Relay: ${process.env.AUX_PARTY_RELAY}/rooms/${room.code}`
          : "Run `npx aux-mcp party-host` and share a tunnel URL as AUX_PARTY_RELAY";
        return okCard(card, {
          code: room.code,
          name: room.name,
          share: `Join AUX party room: ${room.code}`,
          link_hint: linkHint,
          room,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_room_join",
    {
      description: "Join / refresh a party room by code (pulls remote relay if configured).",
      inputSchema: { code: z.string().min(4).max(8) },
    },
    async ({ code }) => {
      try {
        const room = (await pullRemoteRoom(code)) ?? loadRoom(code);
        if (!room) return fail(`Room ${code} not found`);
        const card = partyCard({
          open: room.open,
          top: room.suggestions.map((t) => ({
            name: t.name,
            votes: t.votes,
            artists: t.artists,
          })),
        });
        return okCard(card, room);
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_room_add",
    {
      description: "Add a track suggestion to a party room.",
      inputSchema: {
        code: z.string().min(4),
        track_id: z.string().min(1),
        added_by: z.string().optional(),
      },
    },
    async ({ code, track_id, added_by }) => {
      try {
        await pullRemoteRoom(code);
        const id = extractId(track_id, "track");
        const track = await spotify.get<any>(`/tracks/${id}`);
        const room = roomAdd(code, {
          track_id: id,
          uri: toTrackUri(id),
          name: track.name,
          artists: (track.artists ?? []).map((a: any) => a.name).join(", "),
          added_by,
        });
        await pushRemoteRoom(room);
        const card = partyCard({
          open: room.open,
          top: room.suggestions.map((t) => ({
            name: t.name,
            votes: t.votes,
            artists: t.artists,
          })),
        });
        return okCard(card, room);
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_room_vote",
    {
      description: "Vote on a track in a party room.",
      inputSchema: {
        code: z.string().min(4),
        track_id: z.string().min(1),
        delta: z.number().int().min(-5).max(5).optional(),
      },
    },
    async ({ code, track_id, delta }) => {
      try {
        await pullRemoteRoom(code);
        const room = roomVote(code, extractId(track_id, "track"), delta ?? 1);
        await pushRemoteRoom(room);
        const card = partyCard({
          open: room.open,
          top: room.suggestions.map((t) => ({
            name: t.name,
            votes: t.votes,
            artists: t.artists,
          })),
        });
        return okCard(card, room);
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_room_play_winner",
    {
      description: "Play the top-voted track in a party room.",
      inputSchema: {
        code: z.string().min(4),
        device_id: z.string().optional(),
        remove: z.boolean().optional(),
      },
    },
    async ({ code, device_id, remove }) => {
      try {
        const room = (await pullRemoteRoom(code)) ?? loadRoom(code);
        if (!room?.suggestions.length) return fail("Room empty");
        const top = room.suggestions[0];
        await spotify.put(
          "/me/player/play",
          { uris: [top.uri] },
          { device_id },
          "user"
        );
        if (remove !== false) {
          room.suggestions = room.suggestions.filter(
            (s) => s.track_id !== top.track_id
          );
          saveRoom(room);
          await pushRemoteRoom(room);
        }
        return ok({ played: top, room_code: room.code });
      } catch (e) {
        return fail(e);
      }
    }
  );
}
