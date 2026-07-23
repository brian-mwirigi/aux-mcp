import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Slash-prompt style entry points — the viral on-ramps. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "aux_vibe",
    {
      title: "AUX · Vibe DJ",
      description: "Play music matching a natural-language vibe.",
      argsSchema: {
        vibe: z
          .string()
          .describe("e.g. rainy 2am drive, gym rage, soft morning"),
      },
    },
    ({ vibe }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `DJ this vibe with AUX \`vibe\`: "${vibe}". ` +
              `You invent search_queries (3–6 specific Spotify searches) and estimate energy/valence/tempo — no presets. ` +
              `Play it, show the card. If play fails, get_devices → transfer_playback → retry.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "aux_roast",
    {
      title: "AUX · Taste Roast",
      description: "Roast a playlist or the user's top tracks. Screenshot bait.",
      argsSchema: {
        playlist_id: z
          .string()
          .optional()
          .describe("Playlist id/url — omit to roast top tracks"),
      },
    },
    ({ playlist_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: playlist_id
              ? `Call roast_my_playlist with playlist_id="${playlist_id}". Return the ASCII card prominently and add one extra savage line in your own voice.`
              : `Call roast_my_playlist on my top tracks (medium_term). Return the ASCII card prominently and add one extra savage line in your own voice.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "aux_battle",
    {
      title: "AUX · Playlist Battle",
      description: "Two playlists fight for the aux cord.",
      argsSchema: {
        playlist_a: z.string().describe("First playlist"),
        playlist_b: z.string().describe("Second playlist"),
      },
    },
    ({ playlist_a, playlist_b }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Run aux_battle between playlist_a="${playlist_a}" and playlist_b="${playlist_b}". Show the battle card, declare a winner with trash talk, then offer to blend_tastes if they want peace.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "aux_party",
    {
      title: "AUX · Party Mode",
      description: "Start a voting party for the next track.",
      argsSchema: {
        seed_query: z
          .string()
          .optional()
          .describe("Optional search query to seed first suggestion"),
      },
    },
    ({ seed_query }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Open AUX party mode: party_open, then party_status. ` +
              (seed_query
                ? `Search tracks for "${seed_query}", party_add the best match, show the board.`
                : `Ask me for track suggestions and party_add each one. Show the voting board card after every add.`) +
              ` When I say "play the winner", call party_play_winner.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "aux_dna",
    {
      title: "AUX · Playlist DNA",
      description: "Fingerprint a playlist as a shareable DNA card.",
      argsSchema: {
        playlist_id: z.string().optional(),
      },
    },
    ({ playlist_id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: playlist_id
              ? `Run playlist_dna on "${playlist_id}" and present the DNA card like a lab report.`
              : `Run playlist_dna on my top tracks and present the DNA card like a lab report.`,
          },
        },
      ],
    })
  );
}
