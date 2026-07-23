<p align="center">
  <img src="docs/demo.svg" alt="AUX demo — rainy 2am drive" width="920" />
</p>

<h1 align="center">AUX</h1>
<p align="center"><strong>Spotify, for your AI.</strong><br/>Not a remote. A DJ that talks back.</p>

<p align="center">
  <a href="https://github.com/brian-mwirigi/aux-mcp"><img alt="GitHub" src="https://img.shields.io/badge/github-brian--mwirigi%2Faux--mcp-1DB954?style=flat-square" /></a>
  <img alt="npm" src="https://img.shields.io/badge/npx-spotify--aux-111?style=flat-square" />
  <img alt="hooks" src="https://img.shields.io/badge/hooks-peak-ff2d55?style=flat-square" />
</p>

```bash
npx -y spotify-aux demo
npx -y spotify-aux login
```

Then in Cursor: *“rainy 2am drive”* · *“roast my top tracks”* · *“start auto DJ”*

---

## 60-second setup

1. [Spotify Dashboard](https://developer.spotify.com/dashboard) → create app  
2. Redirect URI (exact):

```
http://127.0.0.1:7654/callback
```

(Optional roast site later: also add `http://127.0.0.1:7656/`)

3. Install & login:

```bash
npm i -g spotify-aux
# or: git clone … && npm i && npm run build
export SPOTIFY_CLIENT_ID=…
export SPOTIFY_CLIENT_SECRET=…
npx -y spotify-aux login
```

4. Cursor MCP config:

```json
{
  "mcpServers": {
    "aux": {
      "command": "npx",
      "args": ["-y", "spotify-aux"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your_id",
        "SPOTIFY_CLIENT_SECRET": "your_secret"
      }
    }
  }
}
```

From a local clone, point `command`/`args` at `node` + `dist/server.js` instead.

---

## Peak hooks

| Say this | What happens |
|----------|----------------|
| *rainy 2am drive* | `vibe` — LLM invents searches, catalog DJ |
| *music Spotify won’t show me* | `vibe` + `anti_algorithm` |
| *DJ for right now* | `context_vibe` — time + weather |
| *keep it going* | `auto_dj_start` → `npx spotify-aux autodj` |
| *roast my week* | `weekly_report` |
| *party room* | `party_room_create` + friend relay |
| *roast this playlist* (no Cursor) | `npx spotify-aux web` |

Every hook can drop an **ASCII card** made for screenshots.

### Party with friends

```bash
# host machine
npx -y spotify-aux party-host
# tunnel it, e.g. cloudflared tunnel --url http://127.0.0.1:7655

# everyone
export AUX_PARTY_RELAY=https://your-tunnel.example
```

Then `party_room_create` → share the **code** → friends `party_room_add` / `party_room_vote`.

### Roast site (no MCP)

```bash
npx -y spotify-aux web
# open http://127.0.0.1:7656
```

---

## Full tool map

<details>
<summary><strong>Peak / viral</strong></summary>

`vibe` · `context_vibe` · `weekly_report` · `auto_dj_start` · `auto_dj_tick` · `auto_dj_stop` · `auto_dj_status` · `party_room_create` · `party_room_join` · `party_room_add` · `party_room_vote` · `party_room_play_winner` · `set_mood` · `adjust_playlist_vibe` · `roast_my_playlist` · `playlist_dna` · `aux_battle` · `blend_tastes` · `music_compatibility` · `whats_playing_story` · `party_*` · `record_taste_feedback` · `get_taste_memory` · `auth_status`
</details>

<details>
<summary><strong>Spotify coverage</strong></summary>

Search, browse, playback, playlists, library, personalization — full Web API surface so the agent never stalls mid-task.
</details>

---

## CLI

```bash
npx -y spotify-aux              # MCP server
npx -y spotify-aux login
npx -y spotify-aux status
npx -y spotify-aux autodj       # refill loop
npx -y spotify-aux party-host   # friend relay :7655
npx -y spotify-aux web          # roast site :7656
npx -y spotify-aux demo
```

After `npm i -g spotify-aux`, binaries: `spotify-aux` and `aux-mcp`.

---

## Auth

| Flow | Unlocks |
|------|---------|
| Client ID + Secret | Search / catalog |
| `npx spotify-aux login` | Playback, library, hooks, Auto-DJ |

Tokens → `~/.aux-mcp/`. Premium + open Spotify app for playback.

---

## Star it. Pass the aux.

[github.com/brian-mwirigi/aux-mcp](https://github.com/brian-mwirigi/aux-mcp)

MIT
