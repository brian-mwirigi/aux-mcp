import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig, isUserLoggedIn, readStoredToken } from "../config.js";
import { ok, fail } from "../format.js";
import { summarizeMemory } from "../memory.js";

export function registerMetaTools(server: McpServer) {
  server.registerTool(
    "auth_status",
    {
      description:
        "Check whether Spotify credentials and user login are configured. Call this if other tools fail with auth errors.",
    },
    async () => {
      try {
        const config = loadConfig();
        const user = readStoredToken(config.tokenFile);
        const client = readStoredToken(config.clientTokenFile);
        return ok({
          client_id_set: Boolean(config.clientId),
          user_logged_in: isUserLoggedIn(config),
          user_token_expires_at: user?.expires_at
            ? new Date(user.expires_at).toISOString()
            : null,
          client_token_cached: Boolean(client),
          token_dir: config.tokenDir,
          redirect_uri: config.redirectUri,
          hint: isUserLoggedIn(config)
            ? "User auth OK — playback/library/hooks available."
            : "Run `npx aux-mcp login` (or npm run login) for playback, playlists, library, and hooks.",
          taste_memory: summarizeMemory(),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );
}
