/** Ambient context for vibe — time, day, optional weather. No hardcoded mood dictionary. */

export interface AmbientContext {
  local_hour: number;
  day_of_week: string;
  period: "late_night" | "morning" | "afternoon" | "evening" | "night";
  weather?: {
    summary: string;
    temp_c?: number;
    area?: string;
  };
  suggested_queries: string[];
  suggested_targets: { energy: number; valence: number; tempo: number };
  blurb: string;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function periodFromHour(hour: number): AmbientContext["period"] {
  if (hour >= 0 && hour < 5) return "late_night";
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export async function getAmbientContext(opts?: {
  weather?: boolean;
  location?: string;
}): Promise<AmbientContext> {
  const now = new Date();
  const hour = now.getHours();
  const period = periodFromHour(hour);
  const day = DAYS[now.getDay()];

  let weather: AmbientContext["weather"];
  if (opts?.weather !== false) {
    weather = await fetchWeather(opts?.location ?? "");
  }

  const base = periodTargets(period, day);
  const queries = [...base.queries];
  let { energy, valence, tempo } = base.targets;
  let blurb = base.blurb;

  if (weather?.summary) {
    const w = weather.summary.toLowerCase();
    if (/rain|drizzle|shower|storm/.test(w)) {
      queries.push("rainy day indie", "window seat neo-soul", "soft rain instrumental");
      energy = clamp(energy - 0.08);
      valence = clamp(valence - 0.1);
      tempo = Math.max(70, tempo - 8);
      blurb += ` · ${weather.summary.toLowerCase()} outside`;
    } else if (/sun|clear|fair/.test(w)) {
      queries.push("sunny afternoon pop", "golden hour indie", "feel good groove");
      valence = clamp(valence + 0.1);
      blurb += ` · ${weather.summary.toLowerCase()}`;
    } else if (/cloud|overcast|fog|mist/.test(w)) {
      queries.push("cloudy day alternative", "grey sky dream pop");
      blurb += ` · ${weather.summary.toLowerCase()}`;
    } else if (/snow|ice/.test(w)) {
      queries.push("winter ambient", "snow day folk");
      energy = clamp(energy - 0.05);
      blurb += ` · ${weather.summary.toLowerCase()}`;
    }
  }

  if (day === "Friday" || day === "Saturday") {
    if (period === "evening" || period === "night") {
      queries.push("friday night groove", "weekend party warm-up");
      energy = clamp(energy + 0.1);
    }
  }
  if (day === "Monday" && period === "morning") {
    queries.push("monday focus instrumental", "soft start workday");
  }

  return {
    local_hour: hour,
    day_of_week: day,
    period,
    weather,
    suggested_queries: unique(queries).slice(0, 8),
    suggested_targets: {
      energy: Number(energy.toFixed(3)),
      valence: Number(valence.toFixed(3)),
      tempo: Math.round(tempo),
    },
    blurb,
  };
}

function periodTargets(period: AmbientContext["period"], day: string) {
  switch (period) {
    case "late_night":
      return {
        queries: ["2am neo-soul", "insomnia alt r&b", "empty street ambient"],
        targets: { energy: 0.28, valence: 0.32, tempo: 88 },
        blurb: `${day} late night`,
      };
    case "morning":
      return {
        queries: ["morning coffee indie", "soft sunrise pop", "wake up groove"],
        targets: { energy: 0.42, valence: 0.62, tempo: 104 },
        blurb: `${day} morning`,
      };
    case "afternoon":
      return {
        queries: ["afternoon drive", "daytime focus beats", "sun through blinds"],
        targets: { energy: 0.5, valence: 0.55, tempo: 112 },
        blurb: `${day} afternoon`,
      };
    case "evening":
      return {
        queries: ["golden hour r&b", "evening unwind", "sunset indie"],
        targets: { energy: 0.4, valence: 0.48, tempo: 98 },
        blurb: `${day} evening`,
      };
    default:
      return {
        queries: ["night drive", "after dark electronic", "city lights r&b"],
        targets: { energy: 0.45, valence: 0.4, tempo: 108 },
        blurb: `${day} night`,
      };
  }
}

async function fetchWeather(location: string): Promise<AmbientContext["weather"] | undefined> {
  try {
    const loc = encodeURIComponent(location || "");
    const url = `https://wttr.in/${loc}?format=j1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "aux-mcp" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as any;
    const cur = data?.current_condition?.[0];
    const area = data?.nearest_area?.[0]?.areaName?.[0]?.value;
    if (!cur) return undefined;
    return {
      summary: cur.weatherDesc?.[0]?.value ?? "unknown",
      temp_c: cur.temp_C ? Number(cur.temp_C) : undefined,
      area,
    };
  } catch {
    return undefined;
  }
}

function clamp(n: number) {
  return Math.min(1, Math.max(0, n));
}

function unique(arr: string[]) {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}
