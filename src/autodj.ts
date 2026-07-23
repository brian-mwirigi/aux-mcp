/**
 * Auto-DJ — keeps the vibe going when a track is near the end.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spotify } from "./client.js";
import { runMoodQueue } from "./mood-engine.js";

export interface AutoDjSession {
  active: boolean;
  text: string;
  search_queries: string[];
  energy: number;
  valence: number;
  tempo: number;
  anti_algorithm?: boolean;
  device_id?: string;
  started_at: number;
  last_tick_at?: number;
  last_track_id?: string;
  plays: number;
}

function sessionPath(): string {
  const dir =
    process.env.AUX_MCP_TOKEN_DIR ??
    process.env.AUXC_MCP_TOKEN_DIR ??
    join(homedir(), ".aux-mcp");
  return join(dir, "autodj.json");
}

export function loadAutoDj(): AutoDjSession | null {
  const path = sessionPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as AutoDjSession;
  } catch {
    return null;
  }
}

function saveAutoDj(session: AutoDjSession): void {
  const path = sessionPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(session, null, 2), "utf8");
}

export function startAutoDj(
  session: Omit<AutoDjSession, "active" | "started_at" | "plays">
): AutoDjSession {
  const full: AutoDjSession = {
    ...session,
    active: true,
    started_at: Date.now(),
    plays: 0,
  };
  saveAutoDj(full);
  return full;
}

export function stopAutoDj(): void {
  const path = sessionPath();
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      writeFileSync(path, JSON.stringify({ active: false }), "utf8");
    }
  }
}

/**
 * If nothing is playing, or < thresholdMs left on current track, queue the next vibe batch.
 */
export async function tickAutoDj(thresholdMs = 20_000): Promise<{
  action: "skipped_tick" | "refilled" | "started" | "inactive";
  session: AutoDjSession | null;
  detail?: unknown;
}> {
  const session = loadAutoDj();
  if (!session?.active) {
    return { action: "inactive", session: null };
  }

  let needRefill = false;
  let currentlyId: string | undefined;

  try {
    const cur = await spotify.get<any>(
      "/me/player/currently-playing",
      undefined,
      "user"
    );
    if (!cur?.item || !cur.is_playing) {
      needRefill = true;
    } else {
      currentlyId = cur.item.id;
      const remaining = (cur.item.duration_ms ?? 0) - (cur.progress_ms ?? 0);
      if (remaining < thresholdMs) needRefill = true;
      // Same track stuck for a long time after last tick → nudge
      if (
        session.last_track_id === currentlyId &&
        session.last_tick_at &&
        Date.now() - session.last_tick_at > 6 * 60_000
      ) {
        needRefill = true;
      }
    }
  } catch {
    needRefill = true;
  }

  if (!needRefill) {
    session.last_tick_at = Date.now();
    session.last_track_id = currentlyId;
    saveAutoDj(session);
    return { action: "skipped_tick", session };
  }

  const result = await runMoodQueue({
    text: session.text,
    search_queries: session.search_queries,
    energy: session.energy,
    valence: session.valence,
    tempo: session.tempo,
    anti_algorithm: session.anti_algorithm,
    device_id: session.device_id,
    limit: 8,
    play: true,
    label: session.text.slice(0, 64),
    explore: true,
  });

  session.plays += 1;
  session.last_tick_at = Date.now();
  session.last_track_id = result.matched[0]?.id;
  saveAutoDj(session);

  return {
    action: session.plays === 1 ? "started" : "refilled",
    session,
    detail: result,
  };
}
