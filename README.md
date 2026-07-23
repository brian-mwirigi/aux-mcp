<p align="center">
  <code>█████╗ ██╗   ██╗██╗  ██╗</code><br/>
  <code>██╔══██╗██║   ██║╚██╗██╔╝</code><br/>
  <code>███████║██║   ██║ ╚███╔╝ </code><br/>
  <code>██╔══██║██║   ██║ ██╔██╗ </code><br/>
  <code>██║  ██║╚██████╔╝██╔╝ ██╗</code><br/>
  <code>╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝</code>
</p>

<h1 align="center">Spotify, for your AI.</h1>

<p align="center">
  <strong>The MCP that doesn't just control Spotify — it <em>takes the aux</em>.</strong><br/>
  Full API coverage so your agent never stalls.<br/>
  Viral hooks so humans actually install it.
</p>

<p align="center">
  <a href="https://github.com/brian-mwirigi/aux-mcp"><img alt="GitHub" src="https://img.shields.io/badge/github-brian--mwirigi%2Faux--mcp-1DB954?style=flat-square" /></a>
  <img alt="MCP" src="https://img.shields.io/badge/MCP-58%2B%20tools-111111?style=flat-square" />
  <img alt="Hooks" src="https://img.shields.io/badge/hooks-screenshot%20bait-ff2d55?style=flat-square" />
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square" />
</p>

---

## One prompt. Instant lore.

```
vibe: rainy 2am drive
```

```
┌──────────────────────────────────────────┐
│ AUX · VIBE                               │
├──────────────────────────────────────────┤
│ LATE_NIGHT + RAINY                       │
│ city lights, empty freeway × gray sky    │
│                                          │
│ energy  ████░░░░░░░░░░░░ 0.31            │
│ valence ███░░░░░░░░░░░░░ 0.33            │
│ tempo   █████░░░░░░░░░░░ 92bpm           │
└──────────────────────────────────────────┘
  aux-mcp · pass the aux
```

Other nuclear prompts:

| Say this | Tool |
|----------|------|
| *“Roast my Discover Weekly”* | `roast_my_playlist` |
| *“DNA this playlist”* | `playlist_dna` |
| *“Battle my gym playlist vs hers”* | `aux_battle` |
| *“Blend us into one playlist”* | `blend_tastes` |
| *“Start party mode — vote on the next track”* | `party_*` |
| *“What's playing — make it cinematic”* | `whats_playing_story` |

Every hook returns a **shareable ASCII card**. That's the screenshot. That's the tweet. That's the install.

---

## Install in 60 seconds

```bash
git clone https://github.com/brian-mwirigi/aux-mcp.git
cd aux-mcp
npm i && npm run build
cp .env.example .env   # Client ID + Secret
npm run login          # browser PKCE → ~/.aux-mcp
```

**Spotify Dashboard** → Redirect URI (exact):

```
http://localhost:7654/callback
```

### Cursor

```json
{
  "mcpServers": {
    "aux": {
      "command": "node",
      "args": ["C:/path/to/aux-mcp/dist/server.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your_id",
        "SPOTIFY_CLIENT_SECRET": "your_secret"
      }
    }
  }
}
```

### Claude Desktop

```json
{
  "mcpServers": {
    "aux": {
      "command": "node",
      "args": ["/absolute/path/to/aux-mcp/dist/server.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your_id",
        "SPOTIFY_CLIENT_SECRET": "your_secret"
      }
    }
  }
}
```

Copy-paste configs also live in [`examples/`](examples/).

---

## The hook stack (why this spreads)

| Hook | Magnitude |
|------|-----------|
| **`vibe`** | Natural-language DJ. Not seeds. Not genres. *Vibes.* |
| **`roast_my_playlist`** | Graded taste assassination. Built for group chats. |
| **`playlist_dna`** | Lab-report fingerprint. Archetypes like `MAINSTAGE MENACE`. |
| **`aux_battle`** | Two playlists. One aux cord. |
| **`blend_tastes`** | Musical blind date → new playlist at the midpoint. |
| **`party_*`** | Chat democracy for the next track. |
| **`whats_playing_story`** | Cinematic caption for right now. |
| **Taste memory** | Skips/repeats persist across sessions and bias future vibes. |

Prompts registered for clients that support them: `aux_vibe` · `aux_roast` · `aux_battle` · `aux_party` · `aux_dna`.

---

## Full arsenal (so the agent never hits a wall)

<details>
<summary><strong>Viral hooks</strong></summary>

`vibe` · `list_vibes` · `set_mood` · `adjust_playlist_vibe` · `roast_my_playlist` · `playlist_dna` · `aux_battle` · `blend_tastes` · `music_compatibility` · `whats_playing_story` · `party_status` · `party_open` · `party_add` · `party_vote` · `party_play_winner` · `party_clear` · `record_taste_feedback` · `get_taste_memory` · `auth_status`
</details>

<details>
<summary><strong>Search & browse</strong></summary>

`search_tracks` · `search_artists` · `search_albums` · `search_playlists` · `get_track` · `get_artist` · `get_artist_top_tracks` · `get_artist_albums` · `get_album` · `get_album_tracks` · `get_playlist` · `get_playlist_tracks` · `get_recommendations` · `get_audio_features` · `get_several_audio_features` · `get_new_releases` · `get_categories` · `get_featured_playlists`
</details>

<details>
<summary><strong>Playback</strong></summary>

`get_current_playback` · `get_currently_playing` · `play` · `pause` · `next_track` · `previous_track` · `seek` · `set_volume` · `set_shuffle` · `set_repeat_mode` · `add_to_queue` · `get_queue` · `get_devices` · `transfer_playback`
</details>

<details>
<summary><strong>Playlists · Library · You</strong></summary>

`get_my_playlists` · `create_playlist` · `add_tracks_to_playlist` · `remove_tracks_from_playlist` · `reorder_playlist_items` · `update_playlist_details` · `get_saved_tracks` · `save_tracks` · `remove_saved_tracks` · `check_saved_tracks` · `get_saved_albums` · `save_albums` · `get_top_tracks` · `get_top_artists` · `get_recently_played` · `get_followed_artists` · `follow_artist` · `unfollow_artist` · `check_following_artist` · `get_user_profile`
</details>

---

## Auth

| Flow | Unlocks |
|------|---------|
| Client ID + Secret | Search / browse / catalog |
| `npm run login` (PKCE, once) | Playback, library, playlists, **all hooks** |

Tokens → `~/.aux-mcp/`. Playback needs **Premium** + an open Spotify device.

> Some Spotify apps get 403 on `/recommendations` or audio-features. **`vibe`** still works — it scores your own library/top tracks.

---

## CLI

```bash
npx aux-mcp          # MCP server
npx aux-mcp login
npx aux-mcp status
npx aux-mcp help
```

---

## Star it. Pass the aux.

If AUX makes your agent actually fun — star the repo, post a roast card, tag a friend into an `aux_battle`.

**[github.com/brian-mwirigi/aux-mcp](https://github.com/brian-mwirigi/aux-mcp)**

MIT
