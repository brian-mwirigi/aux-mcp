# OpenClaw + AUX

Wire **AUX** (`spotify-aux`) into [OpenClaw](https://github.com/openclaw/openclaw) so gateway agents can DJ Spotify through MCP — vibe queues, roast cards, party rooms, auto-DJ.

## Skill path (source of truth)

```text
skills/SKILL.md
```

ClawHub GitHub import discovers this file. Do not nest it under `skills/aux/` on Windows Git — keep it at `skills/SKILL.md`.

## 1-minute setup

```bash
# Spotify app + login (once)
npm i -g spotify-aux
# set SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET in your env
npx spotify-aux login

# Register AUX as an OpenClaw-managed MCP server
openclaw mcp add aux \
  --command npx \
  --arg -y \
  --arg spotify-aux \
  --env SPOTIFY_CLIENT_ID="$SPOTIFY_CLIENT_ID" \
  --env SPOTIFY_CLIENT_SECRET="$SPOTIFY_CLIENT_SECRET"

openclaw mcp doctor aux --probe

# Install the AUX skill → ~/.openclaw/skills/aux/SKILL.md
npx spotify-aux openclaw
```

Spotify redirect URI (exact):

```
http://127.0.0.1:7654/callback
```

## What you get

| Piece | Role |
|-------|------|
| MCP server `spotify-aux` | Tools: `vibe`, `roast_my_playlist`, `party_room_*`, playback, … |
| Skill `skills/SKILL.md` | When/how to call those tools (no hardcoded vibe dictionary) |
| OpenClaw `mcp.servers.aux` | Gateway runtimes can launch AUX on demand |

## Skill install variants

**A. CLI helper (recommended)**

```bash
npx spotify-aux openclaw
```

Copies `skills/SKILL.md` → `~/.openclaw/skills/aux/SKILL.md`.

**B. ClawHub GitHub import**

1. Open ClawHub → Import from GitHub  
2. Select **aux-mcp** (must show `skills/SKILL.md`)  
3. Review → Publish  

**C. Manual**

```bash
mkdir -p ~/.openclaw/skills/aux
cp skills/SKILL.md ~/.openclaw/skills/aux/SKILL.md
```

## Config shape

See [`examples/mcp.openclaw.json`](../examples/mcp.openclaw.json).

```json
{
  "mcp": {
    "servers": {
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
}
```

Local clone instead of npx:

```bash
openclaw mcp add aux \
  --command node \
  --arg /absolute/path/to/aux-mcp/dist/server.js \
  --env SPOTIFY_CLIENT_ID="$SPOTIFY_CLIENT_ID" \
  --env SPOTIFY_CLIENT_SECRET="$SPOTIFY_CLIENT_SECRET"
```

## Verify

```bash
openclaw mcp list
openclaw mcp show aux --json
openclaw mcp doctor aux --probe
npx spotify-aux status
```

In an OpenClaw session, try: *“rainy 2am drive”* or *“roast my top tracks”*.

## Notes

- Playback needs Spotify Premium + an active device.
- Tokens live in `~/.aux-mcp/` after `npx spotify-aux login`.
- Skill source: [`skills/SKILL.md`](../skills/SKILL.md)
- OpenClaw MCP registry docs: https://docs.openclaw.ai/cli/mcp
