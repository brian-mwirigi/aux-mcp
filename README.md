# auxc-mcp

Spotify Web API MCP server for Claude, Cursor, and Cline.

**Full-coverage toolkit** (search, browse, playback, playlists, library, personalization) plus **hooks** that other Spotify MCPs don't ship:

| Hook | What it does |
|------|----------------|
| `set_mood` | Queue music by energy / valence / tempo — not just genre seeds |
| `adjust_playlist_vibe` | “Make this 20% more upbeat” → reorder/prune by audio features |
| `roast_my_playlist` | Shareable roast of a playlist or your top tracks |
| `music_compatibility` | Taste match score between two playlists (or vs you) |
| `record_taste_feedback` / `get_taste_memory` | Cross-session skip/repeat memory that biases vibe tools |

---

## 30-second setup

### 1. Create a Spotify app

1. Open [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app → copy **Client ID** and **Client Secret**
3. Edit Settings → Redirect URIs → add exactly:

```
http://localhost:7654/callback
```

### 2. Install & login

```bash
cd spotify   # this repo
npm install
npm run build

# one-time user auth (browser PKCE → ~/.auxc-mcp/token.json)
set SPOTIFY_CLIENT_ID=your_id
set SPOTIFY_CLIENT_SECRET=your_secret
npm run login
```

On macOS/Linux use `export` instead of `set`.

Read-only search/browse works with client credentials alone. Playback, playlists, library, and hooks need the user token from `npm run login`.

### 3. Add to your MCP client

**Cursor** — `.cursor/mcp.json` (or global MCP settings):

```json
{
  "mcpServers": {
    "spotify": {
      "command": "node",
      "args": ["C:/Users/YOU/Desktop/spotify/dist/server.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your_id",
        "SPOTIFY_CLIENT_SECRET": "your_secret"
      }
    }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spotify": {
      "command": "node",
      "args": ["/absolute/path/to/spotify/dist/server.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "your_id",
        "SPOTIFY_CLIENT_SECRET": "your_secret"
      }
    }
  }
}
```

Restart the client. Ask: *“What’s playing?”* or *“Set a chill low-energy mood and play it.”*

---

## Auth model

| Flow | How | Unlocks |
|------|-----|---------|
| Client credentials | Automatic from Client ID/Secret | Search, browse, catalog reads |
| User PKCE | `npm run login` once; token auto-refreshes | Playback, playlists, library, personalization, hooks |

Tokens live in `~/.auxc-mcp/` (`token.json`, `client-token.json`, `taste-memory.json`). Override with `AUXC_MCP_TOKEN_DIR`.

Playback tools need **Spotify Premium** and an **active device** (`get_devices` → open the Spotify app if the list is empty).

---

## Tool map

### Search & browse (read-only)

`search_tracks` · `search_artists` · `search_albums` · `search_playlists` · `get_track` · `get_artist` · `get_artist_top_tracks` · `get_artist_albums` · `get_album` · `get_album_tracks` · `get_playlist` · `get_playlist_tracks` · `get_recommendations` · `get_audio_features` · `get_several_audio_features` · `get_new_releases` · `get_categories` · `get_featured_playlists`

### Playback (user + device)

`get_current_playback` · `get_currently_playing` · `play` · `pause` · `next_track` · `previous_track` · `seek` · `set_volume` · `set_shuffle` · `set_repeat_mode` · `add_to_queue` · `get_queue` · `get_devices` · `transfer_playback`

### Playlists (user)

`get_my_playlists` · `create_playlist` · `add_tracks_to_playlist` · `remove_tracks_from_playlist` · `reorder_playlist_items` · `update_playlist_details`

### Library (user)

`get_saved_tracks` · `save_tracks` · `remove_saved_tracks` · `check_saved_tracks` · `get_saved_albums` · `save_albums`

### Personalization (user)

`get_top_tracks` · `get_top_artists` · `get_recently_played` · `get_followed_artists` · `follow_artist` · `unfollow_artist` · `check_following_artist` · `get_user_profile`

### Hooks

`set_mood` · `adjust_playlist_vibe` · `roast_my_playlist` · `music_compatibility` · `record_taste_feedback` · `get_taste_memory`

---

## Example prompts

- “Search for tracks by Rosalía and play the first one.”
- “Set mood energy 0.2, valence 0.4, tempo 85 and play it.”
- “Roast my Discover Weekly.”
- “Compare playlist X with my taste — music_compatibility.”
- “Make playlist Y 20% more upbeat.”
- “I skipped that track — remember it.”

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run login` | Browser OAuth (PKCE) |
| `npm start` | Run MCP server on stdio |
| `npm run typecheck` | `tsc --noEmit` |

---

## Notes

- IDs accept bare Spotify IDs, `spotify:` URIs, or `open.spotify.com` URLs.
- Spotify has restricted `/recommendations` and some audio-feature access for newer apps. If those fail, use `set_mood` (library/top-track based) instead.
- This server speaks MCP over **stdio** only.

## License

MIT
