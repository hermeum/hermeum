import { z } from "zod";

// Agent memory entries — the curated notes an agent keeps about its
// environment, conventions, tool quirks, and lessons; managed by Hermeum
// instead of hermes-agent's local MEMORY.md file. The entry model mirrors the
// native memory store (vendor/hermes-agent/tools/memory_tool_store.py):
// MEMORY.md is a list of entries joined by the "§" delimiter, addressed by
// short unique substrings rather than ids. The id below is Hermeum's
// server-side handle for persistence and the future operator UI — the memory
// tool never exposes it to the model.
//
// One store per agent: the plugin protocol resolves the agent from its ingest
// token. There is no "user" target (USER.md is out of scope for Hermeum
// memory), so entries carry no target dimension.

export const AgentMemoryEntrySchema = z
  .object({
    id: z.string().min(1).describe("Server-side entry id (stable across read/save cycles)."),
    agentId: z.string().min(1).describe("Agent that owns the entry."),
    content: z.string().describe("One memory entry — one §-delimited block of the native MEMORY.md."),
    createdAt: z.string().describe("Creation timestamp (ISO 8601)."),
    updatedAt: z.string().describe("Last-modified timestamp (ISO 8601)."),
  })
  .describe("One agent memory entry.");

export type AgentMemoryEntry = z.infer<typeof AgentMemoryEntrySchema>;
