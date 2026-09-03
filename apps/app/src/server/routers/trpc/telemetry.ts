import { initTRPC } from "@trpc/server";
import { z } from "zod";

// SPIKE (issue #147 step 1): minimal, throwaway schema for validating the
// tRPC -> OpenAPI -> Python client pipeline. The real agent-session event
// vocabulary, persistence, and token auth are deliberately deferred.
//
// Standalone initTRPC instance: no SuperJSON transformer (plain JSON wire
// format so non-TS clients can serialize/deserialize) and no Better Auth
// context (the production telemetry API authenticates per-agent tokens).

const AgentSessionEventSchema = z.object({
  eventId: z.string().uuid().describe("Client-generated unique event id."),
  type: z.enum(["session_started", "message", "tool_call", "llm_call", "error"]),
  timestamp: z.string().describe("ISO 8601 timestamp of when the event occurred."),
  data: z.record(z.string(), z.unknown()).describe("Event-specific payload."),
});

const AgentSessionEventBatchSchema = z.object({
  sessionId: z.string().uuid().describe("Identifier of the agent session the events belong to."),
  events: z.array(AgentSessionEventSchema).max(100).describe("Batch of session events."),
});

export type AgentSessionEventBatch = z.infer<typeof AgentSessionEventBatchSchema>;

const IngestAckSchema = z.object({
  accepted: z.number().int().describe("Number of events accepted by the server."),
});

class InMemoryAgentSessionEventStore {
  private events: AgentSessionEventBatch["events"] = [];

  append(batch: AgentSessionEventBatch): number {
    this.events.push(...batch.events);
    return batch.events.length;
  }
}

export const agentSessionEventStore = new InMemoryAgentSessionEventStore();

const t = initTRPC.create();

export const agentSessionRouter = t.router({
  health: t.procedure.output(z.object({ ok: z.boolean() })).query(() => ({ ok: true })),

  agentSessionEvents: t.procedure
    .input(AgentSessionEventBatchSchema)
    .output(IngestAckSchema)
    .mutation(({ input }) => ({ accepted: agentSessionEventStore.append(input) })),
});

export type AgentSessionRouter = typeof agentSessionRouter;
