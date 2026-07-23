import type { TasteStats } from "./mood-engine.js";

/** Screenshot-ready ASCII cards. Keep width ~42 chars for mobile screenshots. */

const W = 42;

function line(char = "─") {
  return char.repeat(W);
}

function pad(text: string, width = W): string {
  const t = text.length > width ? text.slice(0, width - 1) + "…" : text;
  return t + " ".repeat(Math.max(0, width - t.length));
}

function bar(value01: number, width = 16): string {
  const filled = Math.round(clamp01(value01) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function tempoBar(bpm: number): string {
  return bar((bpm - 40) / 180);
}

export function vibeCard(opts: {
  label: string;
  blurb?: string;
  energy: number;
  valence: number;
  tempo: number;
  tracks?: Array<{ name?: string; artists?: Array<{ name: string }> }>;
}): string {
  const tracks = (opts.tracks ?? [])
    .slice(0, 5)
    .map((t, i) => {
      const artists = (t.artists ?? []).map((a) => a.name).join(", ");
      return pad(` ${i + 1}. ${t.name ?? "?"}${artists ? ` — ${artists}` : ""}`);
    })
    .join("\n");

  return [
    `┌${line("─")}┐`,
    `│${pad(" AUX · VIBE")}│`,
    `├${line("─")}┤`,
    `│${pad(` ${opts.label.toUpperCase()}`)}│`,
    opts.blurb ? `│${pad(` ${opts.blurb}`)}│` : null,
    `│${pad("")}│`,
    `│${pad(` energy  ${bar(opts.energy)} ${opts.energy.toFixed(2)}`)}│`,
    `│${pad(` valence ${bar(opts.valence)} ${opts.valence.toFixed(2)}`)}│`,
    `│${pad(` tempo   ${tempoBar(opts.tempo)} ${opts.tempo}bpm`)}│`,
    tracks
      ? [`├${line("─")}┤`, tracks, `│${pad(" …now playing / queued")}`].join("\n")
      : null,
    `└${line("─")}┘`,
    `  aux-mcp · pass the aux`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function dnaCard(opts: {
  title: string;
  stats: TasteStats;
  archetype: string;
}): string {
  const s = opts.stats;
  const top = s.top_artists[0]?.name ?? "???";
  return [
    `╔${line("═")}╗`,
    `║${pad(" AUX · PLAYLIST DNA")}║`,
    `╠${line("═")}╣`,
    `║${pad(` ${opts.title}`)}║`,
    `║${pad(` archetype · ${opts.archetype}`)}║`,
    `╠${line("─")}╣`,
    `║${pad(` ENERGY   ${bar(s.avg_energy)}`)}║`,
    `║${pad(` VALENCE  ${bar(s.avg_valence)}`)}║`,
    `║${pad(` DANCE    ${bar(s.avg_danceability)}`)}║`,
    `║${pad(` ACOUSTIC ${bar(s.avg_acousticness)}`)}║`,
    `║${pad(` TEMPO    ${tempoBar(s.avg_tempo)} ${s.avg_tempo}`)}║`,
    `║${pad(` POP      ${bar(s.avg_popularity / 100)} ${s.avg_popularity}`)}║`,
    `╠${line("─")}╣`,
    `║${pad(` dominant gene · ${top}`)}║`,
    `║${pad(` tracks sequenced · ${s.track_count}`)}║`,
    `╚${line("═")}╝`,
    `  screenshot this. judge later.`,
  ].join("\n");
}

export function roastCard(opts: {
  grade: string;
  lines: string[];
  source: string;
}): string {
  const body = opts.lines
    .slice(0, 8)
    .map((l) => `║${pad(` ${l}`)}║`)
    .join("\n");
  return [
    `╔${line("═")}╗`,
    `║${pad(" AUX · TASTE ROAST")}║`,
    `║${pad(` grade ${opts.grade}`)}║`,
    `╠${line("═")}╣`,
    body,
    `╠${line("─")}╣`,
    `║${pad(` src · ${opts.source}`)}║`,
    `╚${line("═")}╝`,
    `  share responsibly. or don't.`,
  ].join("\n");
}

export function battleCard(opts: {
  aName: string;
  bName: string;
  scoreA: number;
  scoreB: number;
  winner: "A" | "B" | "TIE";
  tagline: string;
}): string {
  const wa = Math.round((opts.scoreA / 100) * 16);
  const wb = Math.round((opts.scoreB / 100) * 16);
  return [
    `┌${line("─")}┐`,
    `│${pad(" AUX · BATTLE")}│`,
    `├${line("─")}┤`,
    `│${pad(` A  ${opts.aName}`)}│`,
    `│${pad(`    ${"█".repeat(wa)}${"░".repeat(16 - wa)} ${opts.scoreA}`)}│`,
    `│${pad(` B  ${opts.bName}`)}│`,
    `│${pad(`    ${"█".repeat(wb)}${"░".repeat(16 - wb)} ${opts.scoreB}`)}│`,
    `├${line("─")}┤`,
    `│${pad(` WINNER · ${opts.winner === "TIE" ? "TIE" : opts.winner}`)}│`,
    `│${pad(` ${opts.tagline}`)}│`,
    `└${line("─")}┘`,
    `  two aux cords enter. one leaves.`,
  ].join("\n");
}

export function partyCard(opts: {
  open: boolean;
  top: Array<{ name: string; votes: number; artists?: string }>;
}): string {
  const rows =
    opts.top.length === 0
      ? `│${pad(" (no suggestions yet — party_add a track)")}│`
      : opts.top
          .slice(0, 8)
          .map(
            (t, i) =>
              `│${pad(` ${i + 1}. +${t.votes}  ${t.name}${t.artists ? ` · ${t.artists}` : ""}`)}│`
          )
          .join("\n");
  return [
    `┌${line("─")}┐`,
    `│${pad(" AUX · PARTY MODE")}│`,
    `│${pad(` status · ${opts.open ? "OPEN" : "CLOSED"}`)}│`,
    `├${line("─")}┤`,
    rows,
    `└${line("─")}┘`,
    `  democracy, but make it loud.`,
  ].join("\n");
}

export function archetypeFromStats(stats: TasteStats): string {
  const { avg_energy: e, avg_valence: v, avg_danceability: d, avg_popularity: p } =
    stats;
  if (e > 0.75 && d > 0.7) return "MAINSTAGE MENACE";
  if (e < 0.35 && v < 0.35) return "SOFT CHAOS BALLAD CORE";
  if (v > 0.7 && e < 0.5) return "GOLDEN-HOUR OPTIMIST";
  if (p > 70) return "ALGORITHM'S FAVORITE CHILD";
  if (p < 35) return "UNDERGROUND GATEKEEPER";
  if (d < 0.35) return "ANTI-DANCE THEORIST";
  if (e > 0.65 && v < 0.4) return "BEAUTIFUL RAGE";
  return "PROFESSIONALLY MEDIUM";
}
