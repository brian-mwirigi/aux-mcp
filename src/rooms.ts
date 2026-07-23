/**
 * Multi-user party rooms — local store + optional HTTP relay for friend links.
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export interface RoomTrack {
  track_id: string;
  uri: string;
  name: string;
  artists: string;
  votes: number;
  added_by?: string;
  added_at: number;
}

export interface PartyRoom {
  code: string;
  name: string;
  open: boolean;
  created_at: number;
  updated_at: number;
  suggestions: RoomTrack[];
}

function roomsDir(): string {
  const base =
    process.env.AUX_MCP_TOKEN_DIR ??
    process.env.AUXC_MCP_TOKEN_DIR ??
    join(homedir(), ".aux-mcp");
  return join(base, "rooms");
}

function roomPath(code: string): string {
  return join(roomsDir(), `${code.toUpperCase()}.json`);
}

function ensureDir(): void {
  const d = roomsDir();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

export function createRoom(name?: string): PartyRoom {
  ensureDir();
  let code = randomCode();
  while (existsSync(roomPath(code))) code = randomCode();
  const room: PartyRoom = {
    code,
    name: name ?? "AUX Party",
    open: true,
    created_at: Date.now(),
    updated_at: Date.now(),
    suggestions: [],
  };
  saveRoom(room);
  return room;
}

export function loadRoom(code: string): PartyRoom | null {
  const path = roomPath(code);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PartyRoom;
  } catch {
    return null;
  }
}

export function saveRoom(room: PartyRoom): void {
  ensureDir();
  room.updated_at = Date.now();
  writeFileSync(roomPath(room.code), JSON.stringify(room, null, 2), "utf8");
}

export function listRooms(): PartyRoom[] {
  ensureDir();
  return readdirSync(roomsDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadRoom(f.replace(/\.json$/, "")))
    .filter(Boolean) as PartyRoom[];
}

export function roomAdd(
  code: string,
  track: Omit<RoomTrack, "votes" | "added_at"> & { votes?: number }
): PartyRoom {
  const room = loadRoom(code);
  if (!room) throw new Error(`Room ${code} not found`);
  if (!room.open) throw new Error("Room is closed");
  const existing = room.suggestions.find((s) => s.track_id === track.track_id);
  if (existing) {
    existing.votes += 1;
  } else {
    room.suggestions.push({
      ...track,
      votes: track.votes ?? 1,
      added_at: Date.now(),
    });
  }
  room.suggestions.sort((a, b) => b.votes - a.votes || a.added_at - b.added_at);
  saveRoom(room);
  return room;
}

export function roomVote(code: string, trackId: string, delta = 1): PartyRoom {
  const room = loadRoom(code);
  if (!room) throw new Error(`Room ${code} not found`);
  const item = room.suggestions.find((s) => s.track_id === trackId);
  if (!item) throw new Error("Track not in room");
  item.votes = Math.max(0, item.votes + delta);
  room.suggestions.sort((a, b) => b.votes - a.votes || a.added_at - b.added_at);
  saveRoom(room);
  return room;
}

/** Optional remote relay — when AUX_PARTY_RELAY is set, sync room JSON there. */
export async function pullRemoteRoom(code: string): Promise<PartyRoom | null> {
  const base = process.env.AUX_PARTY_RELAY;
  if (!base) return loadRoom(code);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/rooms/${code.toUpperCase()}`);
    if (!res.ok) return loadRoom(code);
    const room = (await res.json()) as PartyRoom;
    saveRoom(room);
    return room;
  } catch {
    return loadRoom(code);
  }
}

export async function pushRemoteRoom(room: PartyRoom): Promise<void> {
  const base = process.env.AUX_PARTY_RELAY;
  if (!base) return;
  try {
    await fetch(`${base.replace(/\/$/, "")}/rooms/${room.code}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(room),
    });
  } catch {
    /* offline ok */
  }
}

export function startPartyHost(port = 7655): void {
  ensureDir();
  const server = createServer(async (req, res) => {
    try {
      await handleRelay(req, res);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`
╔══════════════════════════════════════╗
║        AUX  ·  party host            ║
╚══════════════════════════════════════╝
  Local:  http://127.0.0.1:${port}
  Friends set: AUX_PARTY_RELAY=<your-tunnel-url>

  Share a room code from party_room_create.
  Tip: cloudflared tunnel --url http://127.0.0.1:${port}
`);
  });
}

async function handleRelay(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "aux-party" }));
    return;
  }

  const match = url.pathname.match(/^\/rooms\/([A-Za-z0-9]+)$/);
  if (!match) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }
  const code = match[1].toUpperCase();

  if (req.method === "GET") {
    const room = loadRoom(code);
    if (!room) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "room not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(room));
    return;
  }

  if (req.method === "PUT") {
    const body = await readBody(req);
    const room = JSON.parse(body) as PartyRoom;
    room.code = code;
    saveRoom(room);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(room));
    return;
  }

  res.writeHead(405);
  res.end("method not allowed");
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
