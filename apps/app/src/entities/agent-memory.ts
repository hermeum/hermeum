import { z } from "zod";

// Agent memory entries — operator-authored notes about the agent's
// environment, conventions, tool quirks, and lessons, managed in Hermeum and
// injected into the agent as recalled context (read-only to the agent). The id
// is the server-side handle the operator UI uses to edit and delete entries.
// Entries are rendered joined by the "§" delimiter when recalled.
//
// One store per agent: the plugin protocol resolves the agent from its ingest
// token. There is no "user" target — entries carry no target dimension.

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
