import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spotify, SpotifyApiError } from "../client.js";
import {
  ok,
  fail,
  extractId,
  toTrackUri,
  summarizeTrack,
} from "../format.js";
import {
  recordFeedback,
  summarizeMemory,
  getAvoidTrackIds,
  getPreferTrackIds,
  type FeedbackAction,
} from "../memory.js";

interface AudioFeatures {
  id: string;
  energy: number;
  valence: number;
  tempo: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  loudness: number;
}

function vibeDistance(
  f: AudioFeatures,
  target: { energy: number; valence: number; tempo: number }
): number {
  // Normalize tempo to 0-1 around 40-220 BPM.
  const tempoN = (f.tempo - 40) / 180;
  const tTempo = (target.tempo - 40) / 180;
  const de = f.energy - target.energy;
  const dv = f.valence - target.valence;
  const dt = tempoN - tTempo;
  return Math.sqrt(de * de + dv * dv + dt * dt);
}

async function fetchAudioFeatures(ids: string[]): Promise<AudioFeatures[]> {
  const features: AudioFeatures[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const data = await spotify.get<any>("/audio-features", {
        ids: chunk.join(","),
      });
      for (const f of data.audio_features ?? []) {
        if (f?.id) features.push(f);
      }
    } catch (e) {
      // Audio features may be restricted — rethrow with context
      if (e instanceof SpotifyApiError) throw e;
      throw e;
    }
  }
  return features;
}

async function collectCandidateTracks(limit: number): Promise<any[]> {
  const tracks: any[] = [];
  const seen = new Set<string>();

  const push = (items: any[]) => {
    for (const t of items) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      tracks.push(t);
    }
  };

  try {
    const top = await spotify.get<any>(
      "/me/top/tracks",
      { time_range: "medium_term", limit: 50 },
      "user"
    );
    push(top.items ?? []);
  } catch {
    // ignore if no user auth
  }

  try {
    const recent = await spotify.get<any>(
      "/me/player/recently-played",
      { limit: 50 },
      "user"
    );
    push((recent.items ?? []).map((i: any) => i.track));
  } catch {
    // ignore
  }

  try {
    const saved = await spotify.get<any>(
      "/me/tracks",
      { limit: 50 },
      "user"
    );
    push((saved.items ?? []).map((i: any) => i.track));
  } catch {
    // ignore
  }

  // Top artists → their top tracks to widen the pool
  try {
    const artists = await spotify.get<any>(
      "/me/top/artists",
      { time_range: "medium_term", limit: 5 },
      "user"
    );
    for (const a of artists.items ?? []) {
      const top = await spotify.get<any>(`/artists/${a.id}/top-tracks`, {
        market: "US",
      });
      push(top.tracks ?? []);
      if (tracks.length >= limit * 4) break;
    }
  } catch {
    // ignore
  }

  return tracks.slice(0, Math.max(limit * 4, 80));
}

export function registerHookTools(server: McpServer) {
  server.registerTool(
    "set_mood",
    {
      description:
        "HOOK: Build a queue matching a vibe — energy (0-1), valence/happiness (0-1), tempo (BPM). Uses your library/top tracks + audio features, respects cross-session taste memory, then queues (and optionally plays) matches. Distinct from seed-based recommendations.",
      inputSchema: {
        energy: z.number().min(0).max(1).describe("0=calm … 1=intense"),
        valence: z
          .number()
          .min(0)
          .max(1)
          .describe("0=sad/dark … 1=happy/bright"),
        tempo: z
          .number()
          .min(40)
          .max(220)
          .describe("Target BPM, e.g. 90 chill / 128 dance"),
        limit: z.number().int().min(1).max(30).optional(),
        play: z
          .boolean()
          .optional()
          .describe("Start playing the matched tracks (default true)"),
        device_id: z.string().optional(),
      },
    },
    async ({ energy, valence, tempo, limit, play, device_id }) => {
      try {
        const n = limit ?? 15;
        const candidates = await collectCandidateTracks(n);
        if (!candidates.length) {
          return fail(
            "No candidate tracks found. Log in (`npm run login`) and listen/like some music first."
          );
        }

        const avoid = new Set(getAvoidTrackIds());
        const prefer = new Set(getPreferTrackIds());
        const filtered = candidates.filter((t) => !avoid.has(t.id));
        const ids = filtered.map((t) => t.id);
        const features = await fetchAudioFeatures(ids);
        const byId = new Map(features.map((f) => [f.id, f]));

        const scored = filtered
          .map((t) => {
            const f = byId.get(t.id);
            if (!f) return null;
            let dist = vibeDistance(f, { energy, valence, tempo });
            if (prefer.has(t.id)) dist *= 0.7; // bias toward remembered likes/repeats
            return { track: t, features: f, distance: dist };
          })
          .filter(Boolean) as Array<{
          track: any;
          features: AudioFeatures;
          distance: number;
        }>;

        scored.sort((a, b) => a.distance - b.distance);
        const picked = scored.slice(0, n);

        if (!picked.length) {
          return fail(
            "Could not score tracks (audio-features unavailable?). Try get_recommendations as a fallback."
          );
        }

        const uris = picked.map((p) => toTrackUri(p.track.id));
        const shouldPlay = play !== false;

        if (shouldPlay) {
          await spotify.put(
            "/me/player/play",
            { uris },
            { device_id },
            "user"
          );
        } else {
          for (const uri of uris) {
            await spotify.post(
              "/me/player/queue",
              undefined,
              { uri, device_id },
              "user"
            );
          }
        }

        return ok({
          vibe: { energy, valence, tempo },
          played: shouldPlay,
          matched: picked.map((p) => ({
            ...summarizeTrack(p.track),
            energy: p.features.energy,
            valence: p.features.valence,
            tempo: p.features.tempo,
            vibe_distance: Number(p.distance.toFixed(3)),
          })),
          avoided_from_memory: avoid.size,
          preferred_boosted: picked.filter((p) => prefer.has(p.track.id)).length,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "adjust_playlist_vibe",
    {
      description:
        "HOOK: Shift a playlist toward a vibe target (e.g. '20% more upbeat'). Reorders by audio-feature proximity and optionally prunes farthest tracks. Does not invent new songs — reshapes what you already have.",
      inputSchema: {
        playlist_id: z.string().min(1),
        energy_delta: z
          .number()
          .min(-1)
          .max(1)
          .optional()
          .describe("e.g. 0.2 = 20% more energetic"),
        valence_delta: z.number().min(-1).max(1).optional(),
        tempo_delta: z
          .number()
          .min(-80)
          .max(80)
          .optional()
          .describe("BPM shift, e.g. +10"),
        prune_fraction: z
          .number()
          .min(0)
          .max(0.5)
          .optional()
          .describe("Drop farthest N% of tracks (default 0)"),
        apply: z
          .boolean()
          .optional()
          .describe("If false, preview only (default true)"),
      },
    },
    async ({
      playlist_id,
      energy_delta,
      valence_delta,
      tempo_delta,
      prune_fraction,
      apply,
    }) => {
      try {
        const id = extractId(playlist_id, "playlist");
        const page = await spotify.get<any>(`/playlists/${id}/tracks`, {
          limit: 100,
        });
        const items = (page.items ?? []).filter((i: any) => i.track?.id);
        if (items.length < 2) {
          return fail("Playlist needs at least 2 tracks.");
        }

        const trackIds = items.map((i: any) => i.track.id as string);
        const features = await fetchAudioFeatures(trackIds);
        const byId = new Map(features.map((f) => [f.id, f]));

        const withF = items
          .map((i: any) => ({ track: i.track, f: byId.get(i.track.id) }))
          .filter((x: any) => x.f) as Array<{ track: any; f: AudioFeatures }>;

        if (!withF.length) return fail("No audio features available for playlist tracks.");

        const avg = {
          energy:
            withF.reduce((s, x) => s + x.f.energy, 0) / withF.length,
          valence:
            withF.reduce((s, x) => s + x.f.valence, 0) / withF.length,
          tempo: withF.reduce((s, x) => s + x.f.tempo, 0) / withF.length,
        };
        const target = {
          energy: clamp01(avg.energy + (energy_delta ?? 0)),
          valence: clamp01(avg.valence + (valence_delta ?? 0)),
          tempo: Math.min(220, Math.max(40, avg.tempo + (tempo_delta ?? 0))),
        };

        const ranked = withF
          .map((x) => ({
            ...x,
            distance: vibeDistance(x.f, target),
          }))
          .sort((a, b) => a.distance - b.distance);

        const prune = prune_fraction ?? 0;
        const keepCount = Math.max(
          1,
          Math.floor(ranked.length * (1 - prune))
        );
        const keep = ranked.slice(0, keepCount);
        const drop = ranked.slice(keepCount);

        const preview = {
          playlist_id: id,
          from_avg: avg,
          target,
          keep: keep.map((x) => ({
            ...summarizeTrack(x.track),
            energy: x.f.energy,
            valence: x.f.valence,
            tempo: x.f.tempo,
            distance: Number(x.distance.toFixed(3)),
          })),
          drop: drop.map((x) => summarizeTrack(x.track)),
        };

        if (apply === false) return ok({ preview: true, ...preview });

        // Replace playlist contents with reordered keep list.
        // Spotify replace: PUT /playlists/{id}/tracks with uris (max 100).
        const uris = keep.map((x) => toTrackUri(x.track.id));
        await spotify.put(
          `/playlists/${id}/tracks`,
          { uris },
          undefined,
          "user"
        );

        return ok({ applied: true, ...preview });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "roast_my_playlist",
    {
      description:
        "HOOK: Analyze a playlist (or your top tracks if omitted) and return a savage, shareable roast of the music taste — plus the stats behind the jokes.",
      inputSchema: {
        playlist_id: z
          .string()
          .optional()
          .describe("Playlist to roast; omit to roast your top tracks"),
        time_range: z
          .enum(["short_term", "medium_term", "long_term"])
          .optional(),
      },
    },
    async ({ playlist_id, time_range }) => {
      try {
        let tracks: any[] = [];
        let source = "top_tracks";

        if (playlist_id) {
          const id = extractId(playlist_id, "playlist");
          const data = await spotify.get<any>(`/playlists/${id}/tracks`, {
            limit: 50,
          });
          tracks = (data.items ?? [])
            .map((i: any) => i.track)
            .filter(Boolean);
          source = `playlist:${id}`;
        } else {
          const data = await spotify.get<any>(
            "/me/top/tracks",
            { time_range: time_range ?? "medium_term", limit: 50 },
            "user"
          );
          tracks = data.items ?? [];
          source = `top_tracks:${time_range ?? "medium_term"}`;
        }

        if (!tracks.length) return fail("Nothing to roast — no tracks found.");

        const features = await fetchAudioFeatures(tracks.map((t) => t.id));
        const stats = computeTasteStats(tracks, features);
        const roast = buildRoast(stats);

        return ok({
          source,
          roast,
          stats,
          sample_tracks: tracks.slice(0, 10).map(summarizeTrack),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "music_compatibility",
    {
      description:
        "HOOK: Compare taste between two playlists (or a playlist vs your top tracks). Returns a compatibility score, shared artists, and a vibe delta summary — great for friend comparisons.",
      inputSchema: {
        playlist_a: z.string().min(1).describe("First playlist ID/URI/URL"),
        playlist_b: z
          .string()
          .optional()
          .describe("Second playlist; omit to compare against your top tracks"),
      },
    },
    async ({ playlist_a, playlist_b }) => {
      try {
        const aTracks = await loadPlaylistTracks(extractId(playlist_a, "playlist"));
        let bTracks: any[];
        let bLabel: string;
        if (playlist_b) {
          bTracks = await loadPlaylistTracks(extractId(playlist_b, "playlist"));
          bLabel = `playlist:${extractId(playlist_b, "playlist")}`;
        } else {
          const top = await spotify.get<any>(
            "/me/top/tracks",
            { time_range: "medium_term", limit: 50 },
            "user"
          );
          bTracks = top.items ?? [];
          bLabel = "your_top_tracks";
        }

        const aFeat = await fetchAudioFeatures(aTracks.map((t) => t.id));
        const bFeat = await fetchAudioFeatures(bTracks.map((t) => t.id));
        const aStats = computeTasteStats(aTracks, aFeat);
        const bStats = computeTasteStats(bTracks, bFeat);

        const aArtists = new Set(
          aTracks.flatMap((t) => (t.artists ?? []).map((x: any) => x.id))
        );
        const bArtists = new Set(
          bTracks.flatMap((t) => (t.artists ?? []).map((x: any) => x.id))
        );
        const sharedArtists = [...aArtists].filter((id) => bArtists.has(id));
        const aIds = new Set(aTracks.map((t) => t.id));
        const sharedTracks = bTracks.filter((t) => aIds.has(t.id));

        const artistJaccard =
          sharedArtists.length /
          Math.max(1, new Set([...aArtists, ...bArtists]).size);
        const featureSim =
          1 -
          Math.min(
            1,
            vibeDistance(
              {
                id: "a",
                energy: aStats.avg_energy,
                valence: aStats.avg_valence,
                tempo: aStats.avg_tempo,
                danceability: 0,
                acousticness: 0,
                instrumentalness: 0,
                speechiness: 0,
                loudness: 0,
              },
              {
                energy: bStats.avg_energy,
                valence: bStats.avg_valence,
                tempo: bStats.avg_tempo,
              }
            )
          );

        const score = Math.round(
          (artistJaccard * 0.45 + featureSim * 0.55) * 100
        );

        return ok({
          playlist_a: extractId(playlist_a, "playlist"),
          playlist_b: bLabel,
          compatibility_score: score,
          verdict: compatibilityVerdict(score),
          shared_track_count: sharedTracks.length,
          shared_artist_count: sharedArtists.length,
          shared_tracks: sharedTracks.slice(0, 10).map(summarizeTrack),
          vibe_delta: {
            energy: Number((bStats.avg_energy - aStats.avg_energy).toFixed(3)),
            valence: Number(
              (bStats.avg_valence - aStats.avg_valence).toFixed(3)
            ),
            tempo: Number((bStats.avg_tempo - aStats.avg_tempo).toFixed(1)),
          },
          a: aStats,
          b: bStats,
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "record_taste_feedback",
    {
      description:
        "HOOK: Record skip/repeat/like/dislike for cross-session memory. Biases future set_mood results.",
      inputSchema: {
        track_id: z.string().min(1),
        action: z.enum(["skip", "repeat", "like", "dislike"]),
        name: z.string().optional(),
      },
    },
    async ({ track_id, action, name }) => {
      try {
        const id = extractId(track_id, "track");
        const mem = recordFeedback(id, action as FeedbackAction, name);
        return ok({
          ok: true,
          track_id: id,
          action,
          score: mem.scores[id],
          summary: summarizeMemory(),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "get_taste_memory",
    {
      description:
        "HOOK: Show cross-session taste memory (skips/repeats/likes) used to bias vibe tools.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(summarizeMemory());
      } catch (e) {
        return fail(e);
      }
    }
  );
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

async function loadPlaylistTracks(playlistId: string): Promise<any[]> {
  const data = await spotify.get<any>(`/playlists/${playlistId}/tracks`, {
    limit: 100,
  });
  return (data.items ?? []).map((i: any) => i.track).filter((t: any) => t?.id);
}

function computeTasteStats(tracks: any[], features: AudioFeatures[]) {
  const avg = (key: keyof AudioFeatures) =>
    features.length
      ? features.reduce((s, f) => s + (Number(f[key]) || 0), 0) / features.length
      : 0;

  const artistCounts = new Map<string, number>();
  for (const t of tracks) {
    for (const a of t.artists ?? []) {
      artistCounts.set(a.name, (artistCounts.get(a.name) ?? 0) + 1);
    }
  }
  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const popularities = tracks.map((t) => t.popularity ?? 0);
  const avgPop =
    popularities.reduce((s, p) => s + p, 0) / Math.max(1, popularities.length);
  const explicitRatio =
    tracks.filter((t) => t.explicit).length / Math.max(1, tracks.length);

  return {
    track_count: tracks.length,
    features_count: features.length,
    avg_energy: Number(avg("energy").toFixed(3)),
    avg_valence: Number(avg("valence").toFixed(3)),
    avg_tempo: Number(avg("tempo").toFixed(1)),
    avg_danceability: Number(avg("danceability").toFixed(3)),
    avg_acousticness: Number(avg("acousticness").toFixed(3)),
    avg_popularity: Number(avgPop.toFixed(1)),
    explicit_ratio: Number(explicitRatio.toFixed(2)),
    top_artists: topArtists,
  };
}

function buildRoast(stats: ReturnType<typeof computeTasteStats>): string {
  const lines: string[] = [];
  lines.push("Alright, I listened. Against my will.");

  if (stats.avg_popularity > 75) {
    lines.push(
      `Your average track popularity is ${stats.avg_popularity}. Congrats — your algorithm has better taste than you do.`
    );
  } else if (stats.avg_popularity < 35) {
    lines.push(
      `Average popularity ${stats.avg_popularity}. Either you're a visionary or you're allergic to songs other humans have heard.`
    );
  } else {
    lines.push(
      `Popularity sitting at a lukewarm ${stats.avg_popularity}. Bold strategy: be aggressively average.`
    );
  }

  if (stats.avg_valence < 0.35) {
    lines.push(
      `Valence ${stats.avg_valence} — this playlist could be a seasonal depression PSA.`
    );
  } else if (stats.avg_valence > 0.7) {
    lines.push(
      `Valence ${stats.avg_valence}. Who hurt you into becoming this relentlessly upbeat?`
    );
  }

  if (stats.avg_energy < 0.35) {
    lines.push(
      `Energy ${stats.avg_energy}. I've heard elevator music with more ambition.`
    );
  } else if (stats.avg_energy > 0.75) {
    lines.push(
      `Energy ${stats.avg_energy}. Do you ever sit down, or is your resting heart rate just a Kick/snare?`
    );
  }

  if (stats.avg_tempo < 90) {
    lines.push(`Average tempo ${stats.avg_tempo} BPM. A nap set to music.`);
  } else if (stats.avg_tempo > 140) {
    lines.push(
      `${stats.avg_tempo} BPM average. Your playlist thinks it's late for a flight.`
    );
  }

  if (stats.explicit_ratio > 0.5) {
    lines.push(
      `${Math.round(stats.explicit_ratio * 100)}% explicit. Charming. Definitely put this on at family dinner.`
    );
  }

  if (stats.top_artists[0]) {
    const top = stats.top_artists[0];
    lines.push(
      `Most appearances: ${top.name} (×${top.count}). We get it. They're your personality now.`
    );
  }

  if (stats.avg_acousticness > 0.6) {
    lines.push(
      `Acousticness ${stats.avg_acousticness}. Very "I own a tote bag and opinions about coffee."`
    );
  }

  lines.push("Anyway — keep streaming. The rest of us need the contrast.");
  return lines.join("\n");
}

function compatibilityVerdict(score: number): string {
  if (score >= 80) return "Dangerously compatible. Road trip playlist writing itself.";
  if (score >= 60) return "Solid overlap — you'd survive an aux cord handoff.";
  if (score >= 40) return "Partial overlap. Negotiate genres like a UN summit.";
  if (score >= 20) return "Rough. One of you is getting headphones.";
  return "Musically estranged. Do not share a car without a tiebreaker.";
}
