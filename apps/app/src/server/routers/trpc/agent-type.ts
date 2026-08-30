import { AgentTypeSummary } from "@/entities";
import { AgentTypeUseCase } from "@/server/usecases/agent-type";
import { protectedProcedure, t } from "./shared.js";

const usecase = new AgentTypeUseCase();

export const agentTypeRouter = t.router({
  list: protectedProcedure.query((): Promise<AgentTypeSummary[]> => {
    return usecase.list();
  }),
});