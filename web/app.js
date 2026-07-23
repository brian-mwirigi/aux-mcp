const SCOPES = "playlist-read-private playlist-read-collaborative";
const REDIRECT = () => `${location.origin}${location.pathname}`;

const form = document.getElementById("form");
const statusEl = document.getElementById("status");
const cardEl = document.getElementById("card");
const copyBtn = document.getElementById("copy");
const goBtn = document.getElementById("go");

const savedId = localStorage.getItem("aux_client_id");
if (savedId) document.getElementById("clientId").value = savedId;

// Handle OAuth callback
const params = new URLSearchParams(location.search);
if (params.get("code")) {
  handleCallback(params.get("code"), params.get("state")).catch((e) =>
    setStatus(e.message || String(e), true)
  );
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const playlist = document.getElementById("playlist").value.trim();
  const clientId = document.getElementById("clientId").value.trim();
  localStorage.setItem("aux_client_id", clientId);
  localStorage.setItem("aux_pending_playlist", playlist);

  const token = sessionStorage.getItem("aux_access_token");
  const exp = Number(sessionStorage.getItem("aux_token_exp") || 0);
  if (token && Date.now() < exp - 30_000) {
    await roastPlaylist(playlist, token);
    return;
  }
  await startLogin(clientId);
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(cardEl.textContent || "");
  copyBtn.textContent = "Copied";
  setTimeout(() => (copyBtn.textContent = "Copy card"), 1200);
});

async function startLogin(clientId) {
  setStatus("Opening Spotify login…");
  const { verifier, challenge } = await pkce();
  const state = randomHex(16);
  sessionStorage.setItem("aux_verifier", verifier);
  sessionStorage.setItem("aux_state", state);

  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", REDIRECT());
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  location.href = url.toString();
}

async function handleCallback(code, state) {
  if (state !== sessionStorage.getItem("aux_state")) {
    throw new Error("State mismatch — try again");
  }
  const clientId = localStorage.getItem("aux_client_id");
  const verifier = sessionStorage.getItem("aux_verifier");
  setStatus("Exchanging token…");
  goBtn.disabled = true;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT(),
    client_id: clientId,
    code_verifier: verifier,
  });
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "Token exchange failed");

  sessionStorage.setItem("aux_access_token", data.access_token);
  sessionStorage.setItem(
    "aux_token_exp",
    String(Date.now() + (data.expires_in || 3600) * 1000)
  );
  history.replaceState({}, "", location.pathname);

  const playlist = localStorage.getItem("aux_pending_playlist");
  if (playlist) {
    document.getElementById("playlist").value = playlist;
    await roastPlaylist(playlist, data.access_token);
  } else {
    setStatus("Logged in. Paste a playlist and roast.");
  }
  goBtn.disabled = false;
}

async function roastPlaylist(input, token) {
  setStatus("Pulling tracks…");
  goBtn.disabled = true;
  cardEl.hidden = true;
  copyBtn.hidden = true;

  const id = extractPlaylistId(input);
  if (!id) throw new Error("Couldn't parse playlist id from that URL");

  const pl = await api(`/playlists/${id}`, token);
  const items = [];
  let url = `/playlists/${id}/tracks?limit=50`;
  while (url && items.length < 50) {
    const page = await api(url, token);
    for (const row of page.items || []) {
      if (row.track?.id) items.push(row.track);
    }
    url = page.next
      ? page.next.replace("https://api.spotify.com/v1", "")
      : null;
  }

  if (!items.length) throw new Error("No tracks on that playlist");

  setStatus("Scoring vibes…");
  const ids = items.map((t) => t.id).slice(0, 50);
  let features = [];
  try {
    const feat = await api(`/audio-features?ids=${ids.join(",")}`, token);
    features = (feat.audio_features || []).filter(Boolean);
  } catch {
    features = [];
  }

  const stats = computeStats(items, features);
  const grade = roastGrade(stats);
  const lines = buildRoastLines(stats);
  const card = renderCard(pl.name || id, grade, lines, stats);
  cardEl.textContent = card;
  cardEl.hidden = false;
  copyBtn.hidden = false;
  setStatus(`${pl.name} · ${items.length} tracks · grade ${grade}`);
  goBtn.disabled = false;
}

function extractPlaylistId(value) {
  const m =
    value.match(/playlist\/([a-zA-Z0-9]+)/) ||
    value.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  return m?.[1] || (/^[a-zA-Z0-9]+$/.test(value) ? value : null);
}

async function api(path, token) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Spotify ${res.status}`);
  }
  return data;
}

function computeStats(tracks, features) {
  const avg = (key) =>
    features.length
      ? features.reduce((s, f) => s + (Number(f[key]) || 0), 0) / features.length
      : 0;
  const pops = tracks.map((t) => t.popularity || 0);
  const artistCounts = new Map();
  for (const t of tracks) {
    for (const a of t.artists || []) {
      artistCounts.set(a.name, (artistCounts.get(a.name) || 0) + 1);
    }
  }
  const top = [...artistCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    avg_energy: avg("energy"),
    avg_valence: avg("valence"),
    avg_tempo: avg("tempo"),
    avg_danceability: avg("danceability"),
    avg_popularity: pops.reduce((s, p) => s + p, 0) / Math.max(1, pops.length),
    explicit_ratio: tracks.filter((t) => t.explicit).length / tracks.length,
    top_artist: top ? `${top[0]} (×${top[1]})` : "???",
    track_count: tracks.length,
  };
}

function roastGrade(s) {
  const weird =
    (1 - s.avg_popularity / 100) * 40 +
    Math.abs(s.avg_valence - 0.5) * 30 +
    Math.abs(s.avg_energy - 0.5) * 20 +
    s.explicit_ratio * 10;
  if (weird > 55) return "S (chaotic)";
  if (weird > 40) return "A (concerning)";
  if (weird > 25) return "B (safe)";
  return "C (NPC)";
}

function buildRoastLines(s) {
  const lines = ["I listened. Against medical advice."];
  if (s.avg_popularity > 75)
    lines.push(`Pop ${s.avg_popularity.toFixed(0)} — algorithm ghostwrote this.`);
  else if (s.avg_popularity < 35)
    lines.push(`Pop ${s.avg_popularity.toFixed(0)} — conspiracy-PDF taste.`);
  else lines.push(`Pop ${s.avg_popularity.toFixed(0)} — gray hoodie energy.`);

  if (s.avg_valence < 0.35)
    lines.push(`Valence ${s.avg_valence.toFixed(2)} — weather advisory.`);
  else if (s.avg_valence > 0.7)
    lines.push(`Valence ${s.avg_valence.toFixed(2)} — corporate retreat core.`);

  if (s.avg_energy > 0.75)
    lines.push(`Energy ${s.avg_energy.toFixed(2)} — resting heart rate is a drop.`);
  else if (s.avg_energy < 0.35)
    lines.push(`Energy ${s.avg_energy.toFixed(2)} — hold music with lore.`);

  lines.push(`Most played gravity: ${s.top_artist}`);
  lines.push("Keep streaming. Someone has to be the contrast.");
  return lines;
}

function renderCard(title, grade, lines, stats) {
  const W = 42;
  const line = (c = "─") => c.repeat(W);
  const pad = (t) => {
    const s = t.length > W ? t.slice(0, W - 1) + "…" : t;
    return s + " ".repeat(Math.max(0, W - s.length));
  };
  const body = lines.map((l) => `║${pad(" " + l)}║`).join("\n");
  return [
    `╔${line("═")}╗`,
    `║${pad(" AUX · TASTE ROAST")}║`,
    `║${pad(" grade " + grade)}║`,
    `╠${line("═")}╣`,
    `║${pad(" " + title)}║`,
    `║${pad(` tracks ${stats.track_count} · pop ${stats.avg_popularity.toFixed(0)}`)}║`,
    `╠${line("─")}╣`,
    body,
    `╚${line("═")}╝`,
    `  aux-mcp · share responsibly. or don't.`,
  ].join("\n");
}

function setStatus(msg, err = false) {
  statusEl.hidden = false;
  statusEl.textContent = msg;
  statusEl.style.color = err ? "#ff6b6b" : "";
}

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

function base64url(bytes) {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomHex(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
