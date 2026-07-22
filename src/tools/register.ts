import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchBrowseTools } from "./search-browse.js";
import { registerPlaybackTools } from "./playback.js";
import { registerPlaylistTools } from "./playlists.js";
import { registerLibraryTools } from "./library.js";
import { registerPersonalizationTools } from "./personalization.js";
import { registerHookTools } from "./hooks.js";
import { registerMetaTools } from "./meta.js";

export function registerAllTools(server: McpServer): void {
  registerMetaTools(server);
  registerSearchBrowseTools(server);
  registerPlaybackTools(server);
  registerPlaylistTools(server);
  registerLibraryTools(server);
  registerPersonalizationTools(server);
  registerHookTools(server);
}
