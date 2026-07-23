import { spotify } from "./client.js";
import { toTrackUri, summarizeTrack } from "./format.js";
import {
  getAvoidTrackIds,
  getPreferTrackIds,
} from "./memory.js";

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

export async function collectCandidateTracks(limit: number): Promise<any[]> {
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
    /* no user */
  }

  try {
    const recent = await spotify.get<any>(
      "/me/player/recently-played",
      { limit: 50 },
      "user"
    );
    push((recent.items ?? []).map((i: any) => i.track));
  } catch {
    /* */
  }

  try {
    const saved = await spotify.get<any>("/me/tracks", { limit: 50 }, "user");
    push((saved.items ?? []).map((i: any) => i.track));
  } catch {
    /* */
  }

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
    /* */
  }

  return tracks.slice(0, Math.max(limit * 4, 80));
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
}) {
  const n = opts.limit ?? 15;
  const candidates = await collectCandidateTracks(n);
  if (!candidates.length) {
    throw new Error(
      "No candidate tracks found. Log in (`npm run login`) and listen/like some music first."
    );
  }

  const avoid = new Set(getAvoidTrackIds());
  const prefer = new Set(getPreferTrackIds());
  const filtered = candidates.filter((t) => !avoid.has(t.id));
  const features = await fetchAudioFeatures(filtered.map((t) => t.id));
  const byId = new Map(features.map((f) => [f.id, f]));
  const target = {
    energy: opts.energy,
    valence: opts.valence,
    tempo: opts.tempo,
  };

  const scored = filtered
    .map((t) => {
      const f = byId.get(t.id);
      if (!f) return null;
      let dist = vibeDistance(f, target);
      if (prefer.has(t.id)) dist *= 0.7;
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
    throw new Error(
      "Could not score tracks (audio-features unavailable?). Try get_recommendations as a fallback."
    );
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
    matched: picked.map((p) => ({
      ...summarizeTrack(p.track),
      energy: p.features.energy,
      valence: p.features.valence,
      tempo: p.features.tempo,
      vibe_distance: Number(p.distance.toFixed(3)),
    })),
    avoided_from_memory: avoid.size,
    preferred_boosted: picked.filter((p) => prefer.has(p.track.id)).length,
  };
}
