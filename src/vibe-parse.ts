import type { VibeTarget } from "./mood-engine.js";

/** Named vibes — the dictionary that makes natural language work. */
export const VIBE_PRESETS: Record<
  string,
  VibeTarget & { aliases: string[]; blurb: string }
> = {
  chill: {
    energy: 0.22,
    valence: 0.45,
    tempo: 84,
    aliases: ["chill", "relax", "laid back", "laid-back", "lounge", "easy"],
    blurb: "soft edges, no agenda",
  },
  focus: {
    energy: 0.28,
    valence: 0.4,
    tempo: 92,
    aliases: ["focus", "study", "deep work", "concentrate", "flow"],
    blurb: "brain on, ego off",
  },
  gym: {
    energy: 0.88,
    valence: 0.62,
    tempo: 142,
    aliases: ["gym", "workout", "lift", "run", "cardio", "training"],
    blurb: "legs day for your ears",
  },
  party: {
    energy: 0.9,
    valence: 0.82,
    tempo: 128,
    aliases: ["party", "club", "dance", "rave", "turn up", "turnt"],
    blurb: "main character at 1am",
  },
  heartbreak: {
    energy: 0.28,
    valence: 0.18,
    tempo: 72,
    aliases: ["heartbreak", "sad", "cry", "breakup", "melancholy", "emo"],
    blurb: "rain on the windows, phone face-down",
  },
  late_night: {
    energy: 0.32,
    valence: 0.34,
    tempo: 96,
    aliases: ["late night", "2am", "3am", "insomnia", "night drive", "after hours"],
    blurb: "city lights, empty freeway",
  },
  morning: {
    energy: 0.45,
    valence: 0.7,
    tempo: 108,
    aliases: ["morning", "sunrise", "coffee", "wake up", "brunch"],
    blurb: "sun through blinds energy",
  },
  rage: {
    energy: 0.95,
    valence: 0.25,
    tempo: 155,
    aliases: ["rage", "angry", "hype aggressive", "beast mode"],
    blurb: "delete your ex, then your neighbors",
  },
  romance: {
    energy: 0.4,
    valence: 0.75,
    tempo: 100,
    aliases: ["romance", "date", "love", "sexy", "intimate", "slow jam"],
    blurb: "dim lights, good decisions optional",
  },
  rainy: {
    energy: 0.3,
    valence: 0.32,
    tempo: 88,
    aliases: ["rain", "rainy", "drizzle", "storm", "cloudy"],
    blurb: "gray sky soundtrack",
  },
  nostalgia: {
    energy: 0.4,
    valence: 0.5,
    tempo: 105,
    aliases: ["nostalgia", "throwback", "old times", "memory", "y2k"],
    blurb: "you had better hair then",
  },
  cinematic: {
    energy: 0.55,
    valence: 0.4,
    tempo: 110,
    aliases: ["cinematic", "film", "score", "epic", "trailer"],
    blurb: "walking in slow motion through your own lore",
  },
};

export interface ParsedVibe extends VibeTarget {
  matched: string[];
  label: string;
  confidence: number;
  blurb: string;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/**
 * Turn free text like "rainy 2am heartbreak but make it gym" into a vibe target.
 */
export function parseVibeText(text: string): ParsedVibe {
  const lower = text.toLowerCase();
  const hits: Array<{ key: string; weight: number }> = [];

  for (const [key, preset] of Object.entries(VIBE_PRESETS)) {
    for (const alias of preset.aliases) {
      if (lower.includes(alias)) {
        hits.push({ key, weight: alias.length });
        break;
      }
    }
  }

  // Soft keyword nudges even without full preset match
  const nudges = {
    energy: 0,
    valence: 0,
    tempo: 0,
  };
  if (/\b(more|extra|super|very|hard)\s+(hype|energy|intense)/.test(lower))
    nudges.energy += 0.15;
  if (/\b(less|low|soft|quiet)\s+(energy|hype)/.test(lower)) nudges.energy -= 0.15;
  if (/\b(happier|brighter|upbeat|feel.?good)/.test(lower)) nudges.valence += 0.15;
  if (/\b(darker|sadder|gloom)/.test(lower)) nudges.valence -= 0.15;
  if (/\b(faster|quicker|uptempo)/.test(lower)) nudges.tempo += 12;
  if (/\b(slower|downtempo)/.test(lower)) nudges.tempo -= 12;
  if (/\b(\d{2,3})\s*bpm\b/.test(lower)) {
    const m = lower.match(/\b(\d{2,3})\s*bpm\b/);
    if (m) nudges.tempo += Number(m[1]) - 110; // relative later
  }

  let energy: number;
  let valence: number;
  let tempo: number;
  let matched: string[];
  let blurb: string;
  let label: string;
  let confidence: number;

  if (hits.length === 0) {
    // Default: late-night chill with nudges
    energy = 0.35 + nudges.energy;
    valence = 0.45 + nudges.valence;
    tempo = 100 + nudges.tempo;
    matched = [];
    blurb = "freestyle vibe — interpreting the chaos";
    label = text.trim().slice(0, 48) || "custom";
    confidence = 0.35;
  } else {
    // Weight by alias length (more specific phrases win)
    const total = hits.reduce((s, h) => s + h.weight, 0);
    energy = 0;
    valence = 0;
    tempo = 0;
    matched = [];
    const blurbs: string[] = [];
    for (const h of hits) {
      const p = VIBE_PRESETS[h.key];
      const w = h.weight / total;
      energy += p.energy * w;
      valence += p.valence * w;
      tempo += p.tempo * w;
      matched.push(h.key);
      blurbs.push(p.blurb);
    }
    energy = clamp01(energy + nudges.energy);
    valence = clamp01(valence + nudges.valence);
    tempo = Math.min(220, Math.max(40, tempo + nudges.tempo));
    blurb = blurbs.join(" × ");
    label = matched.join(" + ");
    confidence = Math.min(0.95, 0.45 + hits.length * 0.2);
  }

  // Explicit BPM override
  const bpmMatch = lower.match(/\b(\d{2,3})\s*bpm\b/);
  if (bpmMatch) {
    tempo = Math.min(220, Math.max(40, Number(bpmMatch[1])));
  }

  return {
    energy: Number(clamp01(energy).toFixed(3)),
    valence: Number(clamp01(valence).toFixed(3)),
    tempo: Math.round(tempo),
    matched,
    label,
    confidence,
    blurb,
  };
}

export function listVibePresets() {
  return Object.entries(VIBE_PRESETS).map(([id, p]) => ({
    id,
    energy: p.energy,
    valence: p.valence,
    tempo: p.tempo,
    aliases: p.aliases,
    blurb: p.blurb,
  }));
}
