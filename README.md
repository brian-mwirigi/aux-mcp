# AUX

**Spotify, for your AI.**

An MCP server that doesn’t just wrap the Spotify API — it gives Claude / Cursor / Cline the aux cord: full playback + library control, plus hooks nobody else ships.

```bash
git clone https://github.com/brian-mwirigi/aux-mcp.git
cd aux-mcp && npm i && npm run build
cp .env.example .env   # add Client ID + Secret
npm run login          # browser → done
```

Then paste one config block (below) and ask:

> *“Set a late-night drive mood and play it.”*  
> *“Roast my Discover Weekly.”*  
> *“Make this playlist 20% more upbeat.”*

---

## Why AUX (not another 40-tool wrapper)

| Everyone else | AUX |
|---|---|
| Seed tracks / genres | **`set_mood`** — energy · valence · tempo → real queue |
| Add / remove tracks | **`adjust_playlist_vibe`** — reshape by audio features |
| — | **`roast_my_playlist`** — shareable taste assassination |
| — | **`music_compatibility`** — score you vs a friend’s playlist |
| Amnesia each chat | **Taste memory** — skips/repeats bias future vibes |

Underneath: **58 tools** so the model never stalls mid-task (*“I’d add that to a playlist but… no tool”*). Infrastructure keeps it installed. Hooks get it installed.

---

## Setup (about 60 seconds)

### 1. Spotify app

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → Create app  
2. Settings → Redirect URIs → add **exactly**:

```
http://localhost:7654/callback
```

3. Copy **Client ID** + **Client Secret**

### 2. Install + login

```bash
npm install
npm run build
cp .env.example .env
# edit .env with your credentials
npm run login
```

Login opens a browser (PKCE), writes tokens to `~/.aux-mcp/`, auto-refreshes forever after.

```bash
npm run status    # sanity check
```

### 3. Wire your client

**Cursor** — project `.cursor/mcp.json` or global MCP settings  
(see also [`examples/mcp.cursor.json`](examples/mcp.cursor.json)):

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

**Claude Desktop** — `claude_desktop_config.json`  
(see [`examples/mcp.claude.json`](examples/mcp.claude.json)):

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

Restart the client. Playback needs **Premium** + Spotify open on a device (`get_devices` if play fails).

---

## Hooks (the reason you’re here)

| Tool | Try saying |
|------|------------|
| `set_mood` | “Energy 0.25, valence 0.4, tempo 85 — play it” |
| `adjust_playlist_vibe` | “Make *Gym* 20% more upbeat” |
| `roast_my_playlist` | “Roast my top tracks this month” |
| `music_compatibility` | “How compatible am I with this playlist?” |
| `record_taste_feedback` | “I skipped that — remember” |
| `get_taste_memory` | “What have you learned about my taste?” |

---

## Full tool map

<details>
<summary><strong>Search & browse</strong> (read-only — client credentials enough)</summary>

`search_tracks` · `search_artists` · `search_albums` · `search_playlists` · `get_track` · `get_artist` · `get_artist_top_tracks` · `get_artist_albums` · `get_album` · `get_album_tracks` · `get_playlist` · `get_playlist_tracks` · `get_recommendations` · `get_audio_features` · `get_several_audio_features` · `get_new_releases` · `get_categories` · `get_featured_playlists`
</details>

<details>
<summary><strong>Playback</strong> (user + active device)</summary>

`get_current_playback` · `get_currently_playing` · `play` · `pause` · `next_track` · `previous_track` · `seek` · `set_volume` · `set_shuffle` · `set_repeat_mode` · `add_to_queue` · `get_queue` · `get_devices` · `transfer_playback`
</details>

<details>
<summary><strong>Playlists</strong></summary>

`get_my_playlists` · `create_playlist` · `add_tracks_to_playlist` · `remove_tracks_from_playlist` · `reorder_playlist_items` · `update_playlist_details`
</details>

<details>
<summary><strong>Library</strong></summary>

`get_saved_tracks` · `save_tracks` · `remove_saved_tracks` · `check_saved_tracks` · `get_saved_albums` · `save_albums`
</details>

<details>
<summary><strong>Personalization</strong></summary>

`get_top_tracks` · `get_top_artists` · `get_recently_played` · `get_followed_artists` · `follow_artist` · `unfollow_artist` · `check_following_artist` · `get_user_profile`
</details>

<details>
<summary><strong>Hooks + meta</strong></summary>

`set_mood` · `adjust_playlist_vibe` · `roast_my_playlist` · `music_compatibility` · `record_taste_feedback` · `get_taste_memory` · `auth_status`
</details>

---

## Auth model

| Flow | How | Unlocks |
|------|-----|---------|
| Client credentials | Automatic from ID/Secret | Search, browse, catalog |
| User PKCE | `npm run login` once | Playback, playlists, library, personalization, hooks |

Tokens: `~/.aux-mcp/` (`token.json`, `client-token.json`, `taste-memory.json`). Override with `AUX_MCP_TOKEN_DIR`.

IDs accept bare IDs, `spotify:` URIs, or `open.spotify.com` URLs.

> Spotify has restricted `/recommendations` (and sometimes audio-features) for newer apps. If those 403, use **`set_mood`** — it builds from your library / top tracks instead.

---

## CLI

```bash
npx aux-mcp          # MCP stdio server
npx aux-mcp login    # browser OAuth
npx aux-mcp status   # creds + login check
npx aux-mcp help
```

---

## License

MIT · [brian-mwirigi/aux-mcp](https://github.com/brian-mwirigi/aux-mcp)
