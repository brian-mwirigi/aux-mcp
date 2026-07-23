/**
 * Live Spotify smoke test (needs .env + npm run login).
 * Run: node scripts/live-smoke.mjs
 */
import { loadDotEnv } from "../dist/env.js";
import { spotify } from "../dist/client.js";
import { parseVibeText } from "../dist/vibe-parse.js";
import { runMoodQueue } from "../dist/mood-engine.js";
import { isUserLoggedIn, loadConfig } from "../dist/config.js";

loadDotEnv();

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\nAUX live smoke\n──────────────");

try {
  const config = loadConfig();
  assert(isUserLoggedIn(config), "user logged in");

  const me = await spotify.get("/me", undefined, "user");
  assert(Boolean(me?.id), `profile: ${me.display_name ?? me.id}`);

  const search = await spotify.get("/search", {
    q: "Frank Ocean",
    type: "track",
    limit: 3,
  });
  const tracks = search.tracks?.items ?? [];
  assert(tracks.length > 0, `search_tracks: "${tracks[0]?.name}"`);

  const devices = await spotify.get("/me/player/devices", undefined, "user");
  const deviceList = devices.devices ?? [];
  console.log(`  · devices online: ${deviceList.length}`);
  if (deviceList[0]) {
    console.log(`    → ${deviceList[0].name} (${deviceList[0].type}) active=${deviceList[0].is_active}`);
  }

  // Audio features — some new Spotify apps get 403; vibe needs this
  try {
    const id = tracks[0].id;
    const feats = await spotify.get(`/audio-features/${id}`);
    assert(typeof feats?.energy === "number", `audio_features energy=${feats.energy}`);
  } catch (e) {
    console.log(`  · audio-features: ${String(e.message ?? e).slice(0, 140)}`);
    assert(false, "audio-features (needed for vibe/hooks)");
  }

  const top = await spotify.get(
    "/me/top/tracks",
    { limit: 3, time_range: "short_term" },
    "user"
  );
  assert(Array.isArray(top.items), `top_tracks: ${(top.items ?? []).length} items`);
  if (top.items?.[0]) console.log(`    → ${top.items[0].name}`);

  // Only auto-play vibe if a device is active
  const active = deviceList.find((d) => d.is_active) ?? deviceList[0];
  if (active) {
    const parsed = parseVibeText("chill late night");
    try {
      const result = await runMoodQueue({
        energy: parsed.energy,
        valence: parsed.valence,
        tempo: parsed.tempo,
        limit: 3,
        play: true,
        device_id: active.id,
        label: parsed.label,
      });
      assert(result.matched.length > 0, `vibe PLAY on ${active.name}: ${result.matched[0]?.name}`);
    } catch (e) {
      console.log(`  · vibe play: ${String(e.message ?? e).slice(0, 140)}`);
      assert(false, "vibe play");
    }
  } else {
    console.log("  · no Spotify device online — open the Spotify app to test vibe playback");
    assert(true, "vibe play skipped (no device)");
  }
} catch (e) {
  failed++;
  console.error("  ✗ fatal:", e.message ?? e);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
