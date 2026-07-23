import { spotify } from "./client.js";
import { toTrackUri, summarizeTrack } from "./format.js";
import {
  getAvoidTrackIds,
  getPreferTrackIds,
} from "./memory.js";
import { discoverCandidateTracks } from "./discover.js";

export interface AudioFeatures {
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

export interface VibeTarget {
  energy: number;
  valence: number;
  tempo: number;
}

export function vibeDistance(f: AudioFeatures, target: VibeTarget): number {
  const tempoN = (f.tempo - 40) / 180;
  const tTempo = (target.tempo - 40) / 180;
  const de = f.energy - target.energy;
  const dv = f.valence - target.valence;
  const dt = tempoN - tTempo;
  return Math.sqrt(de * de + dv * dv + dt * dt);
}

export async function fetchAudioFeatures(ids: string[]): Promise<AudioFeatures[]> {
  const features: AudioFeatures[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const data = await spotify.get<any>("/audio-features", {
      ids: chunk.join(","),
    });
    for (const f of data.audio_features ?? []) {
      if (f?.id) features.push(f);
    }
  }
  return features;
}

/** @deprecated prefer discoverCandidateTracks — kept for callers that only want library. */
export async function collectCandidateTracks(limit: number): Promise<any[]> {
  const { tracks } = await discoverCandidateTracks({
    explore: false,
    limit: Math.max(limit * 4, 80),
  });
  return tracks;
}

export async function loadPlaylistTracks(playlistId: string): Promise<any[]> {
  const data = await spotify.get<any>(`/playlists/${playlistId}/tracks`, {
    limit: 100,
  });
  return (data.items ?? []).map((i: any) => i.track).filter((t: any) => t?.id);
}

export function computeTasteStats(tracks: any[], features: AudioFeatures[]) {
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

export type TasteStats = ReturnType<typeof computeTasteStats>;

export async function runMoodQueue(opts: {
  energy: number;
  valence: number;
  tempo: number;
  limit?: number;
  play?: boolean;
  device_id?: string;
  label?: string;
  /** Raw user text — used to search Spotify's catalog. */
  text?: string;
  /** LLM-chosen search queries (scenes, genres, eras, reference artists). */
  search_queries?: string[];
  /** Pull from catalog (default true). false = mostly user library. */
  explore?: boolean;
}) {
  const n = opts.limit ?? 15;
  const { tracks: candidates, sources } = await discoverCandidateTracks({
    text: opts.text ?? opts.label,
    search_queries: opts.search_queries,
    explore: opts.explore !== false,
    limit: Math.max(n * 8, 100),
  });
  if (!candidates.length) {
    throw new Error(
      "No candidate tracks found. Log in (`npm run login`) and try a richer vibe description."
    );
  }

  const avoid = new Set(getAvoidTrackIds());
  const prefer = new Set(getPreferTrackIds());

  // Don't restart the same song — exclude what's playing + recent history.
  for (const id of await currentlyPlayingAndRecentIds()) {
    avoid.add(id);
  }

  const filtered = candidates.filter((t) => !avoid.has(t.id));
  const pool = filtered.length >= 3 ? filtered : candidates;
  const features = await fetchAudioFeatures(pool.map((t) => t.id));
  const byId = new Map(features.map((f) => [f.id, f]));
  const target = {
    energy: opts.energy,
    valence: opts.valence,
    tempo: opts.tempo,
  };

  // If audio-features are missing/restricted, still play a shuffled catalog sample.
  const scored = pool
    .map((t) => {
      const f = byId.get(t.id);
      if (!f) {
        return {
          track: t,
          features: null as AudioFeatures | null,
          distance: 0.5 + Math.random() * 0.5,
        };
      }
      let dist = vibeDistance(f, target);
      if (prefer.has(t.id)) dist *= 0.75;
      dist += Math.random() * 0.05;
      return { track: t, features: f, distance: dist };
    })
    .filter(Boolean) as Array<{
    track: any;
    features: AudioFeatures | null;
    distance: number;
  }>;

  scored.sort((a, b) => a.distance - b.distance);

  const band = scored.slice(0, Math.min(scored.length, Math.max(n * 4, 30)));
  const picked = weightedSample(band, n);
  if (!picked.length) {
    throw new Error("No tracks left after filtering. Try a different vibe.");
  }

  const uris = picked.map((p) => toTrackUri(p.track.id));
  const shouldPlay = opts.play !== false;

  if (shouldPlay) {
    await spotify.put(
      "/me/player/play",
      { uris },
      { device_id: opts.device_id },
      "user"
    );
  } else {
    for (const uri of uris) {
      await spotify.post(
        "/me/player/queue",
        undefined,
        { uri, device_id: opts.device_id },
        "user"
      );
    }
  }

  return {
    label: opts.label,
    vibe: target,
    played: shouldPlay,
    discovery_sources: sources,
    candidate_count: candidates.length,
    matched: picked.map((p) => ({
      ...summarizeTrack(p.track),
      energy: p.features?.energy,
      valence: p.features?.valence,
      tempo: p.features?.tempo,
      vibe_distance: Number(p.distance.toFixed(3)),
    })),
    avoided_from_memory: avoid.size,
    preferred_boosted: picked.filter((p) => prefer.has(p.track.id)).length,
  };
}

/** Prefer closer tracks, but don't deterministically always pick the same order. */
function weightedSample<T extends { distance: number }>(
  band: T[],
  count: number
): T[] {
  if (band.length <= count) return shuffle(band);
  const remaining = [...band];
  const out: T[] = [];
  while (out.length < count && remaining.length) {
    const weights = remaining.map((x) => 1 / (0.08 + x.distance));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    idx = Math.min(idx, remaining.length - 1);
    out.push(remaining.splice(idx, 1)[0]);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function currentlyPlayingAndRecentIds(): Promise<string[]> {
  const ids: string[] = [];
  try {
    const cur = await spotify.get<any>(
      "/me/player/currently-playing",
      undefined,
      "user"
    );
    if (cur?.item?.id) ids.push(cur.item.id);
  } catch {
    /* */
  }
  try {
    const recent = await spotify.get<any>(
      "/me/player/recently-played",
      { limit: 15 },
      "user"
    );
    for (const i of recent.items ?? []) {
      if (i.track?.id) ids.push(i.track.id);
    }
  } catch {
    /* */
  }
  return ids;
}
