# Contributing to AUX

Thanks for helping ship **Spotify for your AI**. PRs and issues welcome — start with [`good first issue`](https://github.com/brian-mwirigi/aux-mcp/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) if you want a bounded task.

## Quick setup

**Requirements:** Node.js **20+**, a [Spotify Developer](https://developer.spotify.com/dashboard) app.

```bash
git clone https://github.com/brian-mwirigi/aux-mcp.git
cd aux-mcp
npm install
cp .env.example .env
# fill SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET
npm run build
```

Redirect URI (exact):

```
http://127.0.0.1:7654/callback
```

Login (PKCE → `~/.aux-mcp/token.json`):

```bash
npm run login
# or: npx spotify-aux login
```

Wire a **local** MCP client at `node` + `dist/server.js` (see `examples/mcp.cursor.json`). For published installs use `npx -y spotify-aux`.

### Windows notes

- Prefer `http://127.0.0.1:7654/callback` over `localhost` in the Spotify dashboard.
- PowerShell env for a session:

```powershell
$env:SPOTIFY_CLIENT_ID="…"
$env:SPOTIFY_CLIENT_SECRET="…"
npm run login
```

## Scripts

| Command | What it does |
|---------|----------------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | Build + offline smoke (`scripts/smoke.mjs`) |
| `npm run login` | Spotify PKCE login |
| `npm run demo` | Animated terminal trailer |
| `npm run web` | Roast site on `:7656` |
| `npm run autodj` | Auto-DJ refill loop |
| `npm run party-host` | Party relay on `:7655` |
| `npm run openclaw` | Copy `skills/SKILL.md` → `~/.openclaw/skills/aux` |

Optional live check (needs `.env` + login):

```bash
node scripts/live-smoke.mjs
```

## Before you open a PR

1. Branch from `main`: `git checkout -b feat/short-name`
2. Keep scope tight — one idea per PR
3. Run:

```bash
npm run typecheck
npm run smoke
```

4. Match existing style (TypeScript ESM, Zod tool schemas, ASCII cards in `src/cards.ts`)
5. Don’t commit `.env`, tokens, or `~/.aux-mcp` secrets
6. Update README / `examples/` if you change setup or MCP config

### PR title style

- `feat: …` / `fix: …` / `docs: …` / `refactor: …`

Describe **why** in the body. Link an issue when there is one (`Fixes #N`).

## Project map (where to edit)

| Area | Path |
|------|------|
| MCP server entry / CLI | `src/server.ts` |
| Tool registration | `src/register.ts`, `src/tools/` |
| Vibe / discovery | `src/discover.ts`, `src/mood-engine.ts` |
| Peak hooks | `src/tools/viral.ts`, `src/tools/peak.ts` |
| ASCII cards | `src/cards.ts` |
| Auth / tokens | `src/login.ts`, `src/config.ts` |
| Roast web UI | `web/` |
| OpenClaw skill | `skills/SKILL.md` |
| OpenClaw docs | `docs/openclaw.md` |
| MCP examples | `examples/` |

## Ideas we want help with

See open issues labeled **good first issue** / **help wanted**. Rough themes:

- ASCII card themes / variants
- Docs (Windows, Claude Desktop)
- `anti_algorithm` diversity
- Party-room UX
- Architecture docs (tool → Spotify API map)

## Code of conduct

Be respectful. No harassment, spam, or secret scraping. Spotify API use must stay within their [Developer Terms](https://developer.spotify.com/terms).

## License

MIT — see [LICENSE](./LICENSE).
