import { z } from "zod";

import { AgentSessionEventBatchSchema } from "@/entities";
import { TelemetryUseCase } from "@/server/usecases/telemetry";
import { t } from "./shared.js";

// Ingests agent-session telemetry events from hermes agents. The event
// vocabulary (typed per-event payloads) lives in `@/entities/telemetry` —
// it is shared with the trajectory UI read path. Persistence goes through
// TelemetryUseCase into the app database; per-agent token authentication is
// still deferred, so events are stored with a null agent_id for now.

const IngestAckSchema = z.object({
  accepted: z.number().int().describe("Number of events accepted by the server."),
});

const usecase = new TelemetryUseCase();

export const agentSessionRouter = t.router({
  health: t.procedure.output(z.object({ ok: z.boolean() })).query(() => ({ ok: true })),

  agentSessionEvents: t.procedure
    .input(AgentSessionEventBatchSchema)
    .output(IngestAckSchema)
    .mutation(async ({ input }) => ({
      accepted: await usecase.ingestAgentSessionEvents(input),
    })),
});

export type AgentSessionRouter = typeof agentSessionRouter;