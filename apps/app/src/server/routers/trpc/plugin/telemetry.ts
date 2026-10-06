import { z } from "zod";
import {
  AgentSessionEventBatchSchema,
  type AgentSessionEventBatch,
} from "@/entities";
import { t } from "./shared.js";

// Ingests agent-session telemetry events from hermes agents. The event
// vocabulary (typed per-event payloads) lives in `@/entities/telemetry` —
// it is shared with the trajectory UI read path. Persistence and token auth
// are still deferred; the in-memory store below is a spike placeholder.

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

export const agentSessionRouter = t.router({
  health: t.procedure.output(z.object({ ok: z.boolean() })).query(() => ({ ok: true })),

  agentSessionEvents: t.procedure
    .input(AgentSessionEventBatchSchema)
    .output(IngestAckSchema)
    .mutation(({ input }) => ({ accepted: agentSessionEventStore.append(input) })),
});

export type AgentSessionRouter = typeof agentSessionRouter;
