/**
 * Offline smoke tests (no Spotify credentials required).
 * Run: node scripts/smoke.mjs
 */
import { parseVibeText, listVibePresets } from "../dist/vibe-parse.js";
import { vibeCard, dnaCard, battleCard, roastCard, partyCard } from "../dist/cards.js";

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

console.log("\nAUX smoke tests\n────────────────");

const vibe = parseVibeText("rainy 2am drive");
assert(vibe.matched.includes("late_night"), "parses late_night");
assert(vibe.matched.includes("rainy"), "parses rainy");
assert(vibe.tempo > 40 && vibe.tempo < 220, "tempo in range");
assert(vibe.energy >= 0 && vibe.energy <= 1, "energy in range");

const gym = parseVibeText("gym rage 150 bpm");
assert(gym.matched.includes("gym") || gym.matched.includes("rage"), "parses gym/rage");
assert(gym.tempo === 150, "explicit BPM override");

const presets = listVibePresets();
assert(presets.length >= 8, `has ${presets.length} vibe presets`);

const card = vibeCard({
  label: vibe.label,
  blurb: vibe.blurb,
  energy: vibe.energy,
  valence: vibe.valence,
  tempo: vibe.tempo,
});
assert(card.includes("AUX · VIBE"), "vibe card renders");
assert(card.includes("energy"), "vibe card has energy bar");

const dna = dnaCard({
  title: "Test Playlist",
  archetype: "SOFT CHAOS BALLAD CORE",
  stats: {
    track_count: 10,
    features_count: 10,
    avg_energy: 0.3,
    avg_valence: 0.25,
    avg_tempo: 80,
    avg_danceability: 0.3,
    avg_acousticness: 0.6,
    avg_popularity: 40,
    explicit_ratio: 0.1,
    top_artists: [{ name: "Test Artist", count: 3 }],
  },
});
assert(dna.includes("PLAYLIST DNA"), "dna card renders");

const battle = battleCard({
  aName: "Gym",
  bName: "Cry",
  scoreA: 72,
  scoreB: 61,
  winner: "A",
  tagline: "Gym takes the cord.",
});
assert(battle.includes("BATTLE"), "battle card renders");

const roast = roastCard({
  grade: "S (chaotic)",
  lines: ["I listened. Against medical advice.", "Gray hoodie energy."],
  source: "top_tracks",
});
assert(roast.includes("ROAST"), "roast card renders");

const party = partyCard({
  open: true,
  top: [{ name: "Track A", votes: 3, artists: "Artist" }],
});
assert(party.includes("PARTY"), "party card renders");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
