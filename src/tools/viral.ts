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
  loadPlaylistTracks,
  computeTasteStats,
  vibeDistance,
} from "../mood-engine.js";
import { parseVibeText, listVibePresets } from "../vibe-parse.js";
import {
  vibeCard,
  dnaCard,
  battleCard,
  partyCard,
  archetypeFromStats,
} from "../cards.js";
import {
  loadParty,
  partyAdd,
  partyVote,
  partyOpen,
  partyClear,
  partyRemove,
  partyTop,
} from "../party.js";

export function registerViralTools(server: McpServer) {
  server.registerTool(
    "vibe",
    {
      title: "Vibe",
      description:
        "HOOK (flagship): Natural-language DJ. Pass a phrase like 'rainy 2am heartbreak' or 'gym but make it cinematic' — AUX parses energy/valence/tempo and plays a matching queue from your taste + memory. Prefer this over set_mood when the user speaks in vibes.",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .describe("Free-text vibe, e.g. 'late night drive in the rain'"),
        limit: z.number().int().min(1).max(30).optional(),
        play: z.boolean().optional(),
        device_id: z.string().optional(),
      },
    },
    async ({ text, limit, play, device_id }) => {
      try {
        const parsed = parseVibeText(text);
        const result = await runMoodQueue({
          energy: parsed.energy,
          valence: parsed.valence,
          tempo: parsed.tempo,
          limit,
          play,
          device_id,
          label: parsed.label,
        });
        const card = vibeCard({
          label: parsed.label,
          blurb: parsed.blurb,
          energy: parsed.energy,
          valence: parsed.valence,
          tempo: parsed.tempo,
          tracks: result.matched,
        });
        return okCard(card, {
          prompt: text,
          parsed,
          ...result,
          share_tip: "Paste the card in chat / Twitter / Discord.",
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "list_vibes",
    {
      description: "List built-in vibe presets AUX understands in the vibe tool.",
    },
    async () => ok({ presets: listVibePresets() })
  );

  server.registerTool(
    "playlist_dna",
    {
      title: "Playlist DNA",
      description:
        "HOOK: Generate a shareable DNA fingerprint card for a playlist (or your top tracks). Archetype + bars for energy/valence/dance/tempo. Built for screenshots.",
      inputSchema: {
        playlist_id: z
          .string()
          .optional()
          .describe("Omit to DNA your top tracks"),
        time_range: z
          .enum(["short_term", "medium_term", "long_term"])
          .optional(),
      },
    },
    async ({ playlist_id, time_range }) => {
      try {
        let tracks: any[];
        let title: string;
        if (playlist_id) {
          const id = extractId(playlist_id, "playlist");
          const pl = await spotify.get<any>(`/playlists/${id}`);
          tracks = await loadPlaylistTracks(id);
          title = pl.name ?? id;
        } else {
          const data = await spotify.get<any>(
            "/me/top/tracks",
            { time_range: time_range ?? "medium_term", limit: 50 },
            "user"
          );
          tracks = data.items ?? [];
          title = `Top tracks (${time_range ?? "medium_term"})`;
        }
        if (!tracks.length) return fail("No tracks to sequence.");
        const features = await fetchAudioFeatures(tracks.map((t) => t.id));
        const stats = computeTasteStats(tracks, features);
        const archetype = archetypeFromStats(stats);
        const card = dnaCard({ title, stats, archetype });
        return okCard(card, {
          title,
          archetype,
          stats,
          sample: tracks.slice(0, 8).map(summarizeTrack),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "aux_battle",
    {
      title: "AUX Battle",
      description:
        "HOOK: Two playlists enter. One leaves. Scores vibe cohesion + popularity conviction + dance floor IQ, returns a battle card made for group chats.",
      inputSchema: {
        playlist_a: z.string().min(1),
        playlist_b: z.string().min(1),
      },
    },
    async ({ playlist_a, playlist_b }) => {
      try {
        const idA = extractId(playlist_a, "playlist");
        const idB = extractId(playlist_b, "playlist");
        const [plA, plB, tracksA, tracksB] = await Promise.all([
          spotify.get<any>(`/playlists/${idA}`),
          spotify.get<any>(`/playlists/${idB}`),
          loadPlaylistTracks(idA),
          loadPlaylistTracks(idB),
        ]);
        const [featA, featB] = await Promise.all([
          fetchAudioFeatures(tracksA.map((t) => t.id)),
          fetchAudioFeatures(tracksB.map((t) => t.id)),
        ]);
        const statsA = computeTasteStats(tracksA, featA);
        const statsB = computeTasteStats(tracksB, featB);
        const scoreA = battleScore(statsA);
        const scoreB = battleScore(statsB);
        const winner =
          Math.abs(scoreA - scoreB) < 3 ? "TIE" : scoreA > scoreB ? "A" : "B";
        const tagline =
          winner === "TIE"
            ? "Split aux. Nobody sleeps."
            : winner === "A"
              ? `${plA.name} takes the cord.`
              : `${plB.name} takes the cord.`;
        const card = battleCard({
          aName: plA.name ?? "A",
          bName: plB.name ?? "B",
          scoreA,
          scoreB,
          winner,
          tagline,
        });
        return okCard(card, {
          winner,
          tagline,
          a: { id: idA, name: plA.name, score: scoreA, stats: statsA },
          b: { id: idB, name: plB.name, score: scoreB, stats: statsB },
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "blend_tastes",
    {
      title: "Blend",
      description:
        "HOOK: Create (or preview) a new playlist at the vibe midpoint of two playlists — a musical blind date. Pulls closest tracks from both sides.",
      inputSchema: {
        playlist_a: z.string().min(1),
        playlist_b: z.string().min(1),
        name: z.string().optional(),
        limit: z.number().int().min(6).max(50).optional(),
        create: z
          .boolean()
          .optional()
          .describe("If true, create the playlist (default true)"),
      },
    },
    async ({ playlist_a, playlist_b, name, limit, create }) => {
      try {
        const idA = extractId(playlist_a, "playlist");
        const idB = extractId(playlist_b, "playlist");
        const [plA, plB, tracksA, tracksB] = await Promise.all([
          spotify.get<any>(`/playlists/${idA}`),
          spotify.get<any>(`/playlists/${idB}`),
          loadPlaylistTracks(idA),
          loadPlaylistTracks(idB),
        ]);
        const all = [...tracksA, ...tracksB];
        const features = await fetchAudioFeatures(all.map((t) => t.id));
        const byId = new Map(features.map((f) => [f.id, f]));
        const statsA = computeTasteStats(
          tracksA,
          features.filter((f) => tracksA.some((t) => t.id === f.id))
        );
        const statsB = computeTasteStats(
          tracksB,
          features.filter((f) => tracksB.some((t) => t.id === f.id))
        );
        const mid = {
          energy: (statsA.avg_energy + statsB.avg_energy) / 2,
          valence: (statsA.avg_valence + statsB.avg_valence) / 2,
          tempo: (statsA.avg_tempo + statsB.avg_tempo) / 2,
        };
        const n = limit ?? 30;
        const ranked = all
          .map((t) => {
            const f = byId.get(t.id);
            if (!f) return null;
            return { track: t, distance: vibeDistance(f, mid) };
          })
          .filter(Boolean) as Array<{ track: any; distance: number }>;
        // dedupe
        const seen = new Set<string>();
        const picked: typeof ranked = [];
        ranked.sort((a, b) => a.distance - b.distance);
        for (const r of ranked) {
          if (seen.has(r.track.id)) continue;
          seen.add(r.track.id);
          picked.push(r);
          if (picked.length >= n) break;
        }

        const blendName =
          name ?? `AUX Blend · ${plA.name ?? "A"} × ${plB.name ?? "B"}`;
        let playlistId: string | undefined;
        if (create !== false) {
          const me = await spotify.get<any>("/me", undefined, "user");
          const created = await spotify.post<any>(
            `/users/${me.id}/playlists`,
            {
              name: blendName,
              description: `Blind date playlist by AUX. Midpoint vibe e=${mid.energy.toFixed(2)} v=${mid.valence.toFixed(2)} t=${Math.round(mid.tempo)}`,
              public: false,
            },
            undefined,
            "user"
          );
          playlistId = created.id;
          const uris = picked.map((p) => toTrackUri(p.track.id));
          for (let i = 0; i < uris.length; i += 100) {
            await spotify.post(
              `/playlists/${playlistId}/tracks`,
              { uris: uris.slice(i, i + 100) },
              undefined,
              "user"
            );
          }
        }

        const card = vibeCard({
          label: blendName,
          blurb: "two playlists. one timeline.",
          energy: mid.energy,
          valence: mid.valence,
          tempo: Math.round(mid.tempo),
          tracks: picked.map((p) => p.track),
        });

        return okCard(card, {
          name: blendName,
          playlist_id: playlistId,
          midpoint: mid,
          tracks: picked.map((p) => summarizeTrack(p.track)),
          created: create !== false,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_status",
    {
      description: "HOOK: Show the party voting board (shareable card).",
      inputSchema: {},
    },
    async () => {
      try {
        const state = loadParty();
        const top = partyTop(10);
        const card = partyCard({
          open: state.open,
          top: top.map((t) => ({
            name: t.name,
            votes: t.votes,
            artists: t.artists,
          })),
        });
        return okCard(card, state);
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_open",
    {
      description: "HOOK: Open or close party voting.",
      inputSchema: { open: z.boolean().optional() },
    },
    async ({ open }) => {
      try {
        const state = partyOpen(open !== false);
        return ok({ ok: true, open: state.open });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_add",
    {
      description:
        "HOOK: Suggest a track for the party queue (starts at 1 vote). Pass track_id or search-like URI.",
      inputSchema: {
        track_id: z.string().min(1),
        added_by: z.string().optional().describe("Display name of suggester"),
      },
    },
    async ({ track_id, added_by }) => {
      try {
        const id = extractId(track_id, "track");
        const track = await spotify.get<any>(`/tracks/${id}`);
        const state = partyAdd({
          track_id: id,
          uri: toTrackUri(id),
          name: track.name,
          artists: (track.artists ?? []).map((a: any) => a.name).join(", "),
          added_by,
        });
        const card = partyCard({
          open: state.open,
          top: partyTop(10).map((t) => ({
            name: t.name,
            votes: t.votes,
            artists: t.artists,
          })),
        });
        return okCard(card, { added: summarizeTrack(track), state });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_vote",
    {
      description: "HOOK: Upvote (+1) or downvote a party suggestion.",
      inputSchema: {
        track_id: z.string().min(1),
        delta: z.number().int().min(-5).max(5).optional(),
      },
    },
    async ({ track_id, delta }) => {
      try {
        const id = extractId(track_id, "track");
        const state = partyVote(id, delta ?? 1);
        const card = partyCard({
          open: state.open,
          top: partyTop(10).map((t) => ({
            name: t.name,
            votes: t.votes,
            artists: t.artists,
          })),
        });
        return okCard(card, state);
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_play_winner",
    {
      description:
        "HOOK: Play the highest-voted party track (and optionally remove it from the board).",
      inputSchema: {
        device_id: z.string().optional(),
        remove: z.boolean().optional().describe("Remove from board after play"),
      },
    },
    async ({ device_id, remove }) => {
      try {
        const top = partyTop(1)[0];
        if (!top) return fail("Party board empty. party_add some tracks first.");
        await spotify.put(
          "/me/player/play",
          { uris: [top.uri] },
          { device_id },
          "user"
        );
        if (remove !== false) partyRemove(top.track_id);
        const card = partyCard({
          open: loadParty().open,
          top: partyTop(10).map((t) => ({
            name: t.name,
            votes: t.votes,
            artists: t.artists,
          })),
        });
        return okCard(card, {
          played: top,
          message: `Now playing party winner: ${top.name} (+${top.votes})`,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "party_clear",
    {
      description: "Clear all party suggestions.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(partyClear());
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "whats_playing_story",
    {
      title: "Now Playing Story",
      description:
        "HOOK: Cinematic one-liner + share card for whatever is playing right now. Instant screenshot bait.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await spotify.get<any>(
          "/me/player/currently-playing",
          undefined,
          "user"
        );
        if (!data?.item) {
          return fail("Nothing is playing. Start a track, then try again.");
        }
        const t = data.item;
        const artists = (t.artists ?? []).map((a: any) => a.name).join(", ");
        let features = null as null | Awaited<
          ReturnType<typeof fetchAudioFeatures>
        >[0];
        try {
          const f = await fetchAudioFeatures([t.id]);
          features = f[0] ?? null;
        } catch {
          /* */
        }
        const story = features
          ? `${artists} — "${t.name}". Energy ${features.energy.toFixed(2)}, valence ${features.valence.toFixed(2)}, ${Math.round(features.tempo)} BPM. ${storyLine(features.energy, features.valence)}`
          : `${artists} — "${t.name}". Right now. No notes.`;
        const card = vibeCard({
          label: "NOW PLAYING",
          blurb: story,
          energy: features?.energy ?? 0.5,
          valence: features?.valence ?? 0.5,
          tempo: features?.tempo ?? 120,
          tracks: [t],
        });
        return okCard(card, {
          story,
          track: summarizeTrack(t),
          progress_ms: data.progress_ms,
          is_playing: data.is_playing,
          features,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

}

function battleScore(stats: ReturnType<typeof computeTasteStats>): number {
  // Cohesion proxy: mid values are "safe"; extremes score as conviction.
  const conviction =
    Math.abs(stats.avg_energy - 0.5) * 40 +
    Math.abs(stats.avg_valence - 0.5) * 25 +
    stats.avg_danceability * 20 +
    (stats.avg_popularity / 100) * 15;
  return Math.round(Math.min(99, Math.max(10, conviction + 20)));
}

function storyLine(energy: number, valence: number): string {
  if (energy > 0.75 && valence > 0.6) return "Main character unlocked.";
  if (energy > 0.75 && valence < 0.4) return "Beautiful violence.";
  if (energy < 0.35 && valence < 0.35) return "Soft launch of a spiral.";
  if (valence > 0.7) return "Sun in the aux.";
  if (valence < 0.3) return "Gray sky, green play button.";
  return "Holding the timeline together.";
}
