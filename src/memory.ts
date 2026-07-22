/**
 * Cross-session taste memory — persists skips/repeats/likes so vibe tools
 * can bias recommendations across MCP conversations.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type FeedbackAction = "skip" | "repeat" | "like" | "dislike";

export interface FeedbackEvent {
  track_id: string;
  action: FeedbackAction;
  at: number;
  name?: string;
}

export interface TasteMemory {
  version: 1;
  events: FeedbackEvent[];
  /** Aggregated scores per track_id: positive = prefer, negative = avoid. */
  scores: Record<string, number>;
}

const SCORE_DELTA: Record<FeedbackAction, number> = {
  skip: -2,
  dislike: -3,
  repeat: 3,
  like: 2,
};

function memoryPath(): string {
  const fromEnv =
    process.env.AUX_MCP_TOKEN_DIR ?? process.env.AUXC_MCP_TOKEN_DIR;
  const next = join(homedir(), ".aux-mcp");
  const legacy = join(homedir(), ".auxc-mcp");
  const dir =
    fromEnv ??
    (existsSync(next) || !existsSync(legacy) ? next : legacy);
  return join(dir, "taste-memory.json");
}

export function loadMemory(): TasteMemory {
  const path = memoryPath();
  if (!existsSync(path)) {
    return { version: 1, events: [], scores: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as TasteMemory;
    if (!raw.scores) raw.scores = {};
    if (!raw.events) raw.events = [];
    return raw;
  } catch {
    return { version: 1, events: [], scores: {} };
  }
}

function saveMemory(mem: TasteMemory): void {
  const path = memoryPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Cap event log so the file stays small.
  if (mem.events.length > 500) {
    mem.events = mem.events.slice(-500);
  }
  writeFileSync(path, JSON.stringify(mem, null, 2), "utf8");
}

export function recordFeedback(
  trackId: string,
  action: FeedbackAction,
  name?: string
): TasteMemory {
  const mem = loadMemory();
  mem.events.push({ track_id: trackId, action, at: Date.now(), name });
  mem.scores[trackId] = (mem.scores[trackId] ?? 0) + SCORE_DELTA[action];
  saveMemory(mem);
  return mem;
}

export function getAvoidTrackIds(threshold = -2): string[] {
  const mem = loadMemory();
  return Object.entries(mem.scores)
    .filter(([, score]) => score <= threshold)
    .map(([id]) => id);
}

export function getPreferTrackIds(threshold = 2): string[] {
  const mem = loadMemory();
  return Object.entries(mem.scores)
    .filter(([, score]) => score >= threshold)
    .map(([id]) => id);
}

export function summarizeMemory() {
  const mem = loadMemory();
  const skips = mem.events.filter((e) => e.action === "skip").length;
  const repeats = mem.events.filter((e) => e.action === "repeat").length;
  const likes = mem.events.filter((e) => e.action === "like").length;
  const dislikes = mem.events.filter((e) => e.action === "dislike").length;
  return {
    total_events: mem.events.length,
    skips,
    repeats,
    likes,
    dislikes,
    avoid_track_ids: getAvoidTrackIds(),
    prefer_track_ids: getPreferTrackIds(),
    recent: mem.events.slice(-20),
  };
}
