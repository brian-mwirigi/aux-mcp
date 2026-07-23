/**
 * Party mode — multi-suggestion voting queue persisted across chats.
 * Anyone in the conversation can party_add / party_vote; host plays the winner.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface PartySuggestion {
  track_id: string;
  uri: string;
  name: string;
  artists: string;
  votes: number;
  added_by?: string;
  added_at: number;
}

export interface PartyState {
  open: boolean;
  suggestions: PartySuggestion[];
  updated_at: number;
}

function partyPath(): string {
  const fromEnv =
    process.env.AUX_MCP_TOKEN_DIR ?? process.env.AUXC_MCP_TOKEN_DIR;
  const next = join(homedir(), ".aux-mcp");
  const legacy = join(homedir(), ".auxc-mcp");
  const dir =
    fromEnv ?? (existsSync(next) || !existsSync(legacy) ? next : legacy);
  return join(dir, "party.json");
}

export function loadParty(): PartyState {
  const path = partyPath();
  if (!existsSync(path)) {
    return { open: true, suggestions: [], updated_at: Date.now() };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PartyState;
  } catch {
    return { open: true, suggestions: [], updated_at: Date.now() };
  }
}

function saveParty(state: PartyState): void {
  const path = partyPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  state.updated_at = Date.now();
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
}

export function partyOpen(open = true): PartyState {
  const s = loadParty();
  s.open = open;
  saveParty(s);
  return s;
}

export function partyAdd(input: {
  track_id: string;
  uri: string;
  name: string;
  artists: string;
  added_by?: string;
}): PartyState {
  const s = loadParty();
  if (!s.open) throw new Error("Party is closed. party_open first.");
  const existing = s.suggestions.find((x) => x.track_id === input.track_id);
  if (existing) {
    existing.votes += 1;
  } else {
    s.suggestions.push({
      track_id: input.track_id,
      uri: input.uri,
      name: input.name,
      artists: input.artists,
      votes: 1,
      added_by: input.added_by,
      added_at: Date.now(),
    });
  }
  s.suggestions.sort((a, b) => b.votes - a.votes || a.added_at - b.added_at);
  saveParty(s);
  return s;
}

export function partyVote(trackId: string, delta = 1): PartyState {
  const s = loadParty();
  const item = s.suggestions.find((x) => x.track_id === trackId);
  if (!item) throw new Error("Track not in party queue. party_add it first.");
  item.votes = Math.max(0, item.votes + delta);
  s.suggestions.sort((a, b) => b.votes - a.votes || a.added_at - b.added_at);
  saveParty(s);
  return s;
}

export function partyClear(): PartyState {
  const s = loadParty();
  s.suggestions = [];
  saveParty(s);
  return s;
}

export function partyRemove(trackId: string): PartyState {
  const s = loadParty();
  s.suggestions = s.suggestions.filter((x) => x.track_id !== trackId);
  saveParty(s);
  return s;
}

export function partyTop(n = 10): PartySuggestion[] {
  return loadParty().suggestions.slice(0, n);
}
