import { z } from "zod";

import { AgentSessionSchema } from "@/entities";
import { AgentSessionUseCase } from "@/server/usecases/agent-session";
import { t, tokenProtectedProcedure } from "./shared.js";

// Ingests agent-session telemetry events from hermes agents, authenticated
// by the per-agent ingest token (tokenProtectedProcedure resolves the agent
// from the Authorization bearer token). The event vocabulary (typed
// per-event payloads) lives in `@/entities/telemetry` — it is shared with
// the trajectory UI read path. Persistence goes through
// AgentSessionUseCase into the app database, stamped with the resolved
// agent_id.

const IngestAckSchema = z.object({
  accepted: z.number().int().describe("Number of events accepted by the server."),
});

const usecase = new AgentSessionUseCase();

export const agentSessionRouter = t.router({
  // Fail-closed liveness probe: the token guard runs before the handler, so
  // a healthy answer doubles as an auth check for the plugin's registration
  // health_check.
  health: tokenProtectedProcedure
    .output(z.object({ ok: z.boolean() }))
    .query(() => ({ ok: true })),

  agentSessionEvents: tokenProtectedProcedure
    .input(AgentSessionSchema)
    .output(IngestAckSchema)
    .mutation(async ({ ctx, input }) => ({
      accepted: await usecase.ingestAgentSessionEvents(input, ctx.agentId),
    })),
});

export type AgentSessionRouter = typeof agentSessionRouter;