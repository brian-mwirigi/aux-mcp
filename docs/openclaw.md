# OpenClaw + AUX

Wire **AUX** (`spotify-aux`) into [OpenClaw](https://github.com/openclaw/openclaw) so gateway agents can DJ Spotify through MCP.

## Skill path (source of truth)

```text
skills/aux-mcp/SKILL.md
```

Same layout as CostHQ (`skills/<slug>/SKILL.md`). ClawHub package: [@brian-mwirigi/aux-mcp](https://clawhub.ai/brian-mwirigi/aux-mcp)

## Install from ClawHub

```bash
openclaw skills install @brian-mwirigi/aux-mcp
```

## 1-minute setup (MCP + skill)

```bash
npm i -g spotify-aux
npx spotify-aux login

openclaw mcp add aux \
  --command npx \
  --arg -y \
  --arg spotify-aux \
  --env SPOTIFY_CLIENT_ID="$SPOTIFY_CLIENT_ID" \
  --env SPOTIFY_CLIENT_SECRET="$SPOTIFY_CLIENT_SECRET"

openclaw mcp doctor aux --probe
npx spotify-aux openclaw   # optional local copy of the skill
```

Redirect URI (exact): `http://127.0.0.1:7654/callback`

## Skill install variants

**A. ClawHub (recommended)**

```bash
openclaw skills install @brian-mwirigi/aux-mcp
```

**B. CLI helper**

```bash
npx spotify-aux openclaw
# → ~/.openclaw/skills/aux-mcp/SKILL.md
```

**C. Manual**

```bash
mkdir -p ~/.openclaw/skills/aux-mcp
cp skills/aux-mcp/SKILL.md ~/.openclaw/skills/aux-mcp/SKILL.md
```

**D. Re-import on ClawHub**

If the ClawHub page says “No SKILL.md”, re-import from GitHub after `skills/aux-mcp/SKILL.md` is on `main`, then publish again.

## Config

See [`examples/mcp.openclaw.json`](../examples/mcp.openclaw.json).

## Notes

- Playback needs Spotify Premium + an active device.
- Skill source: [`skills/aux-mcp/SKILL.md`](../skills/aux-mcp/SKILL.md)
- ClawHub: https://clawhub.ai/brian-mwirigi/aux-mcp
