import { AgentTypeSummary, DEFAULT_AGENT_TYPE_KEY } from "@/entities";
import { BaseUseCase, HermeumConfigLoadable } from "@/server/usecases/mixin";

export class AgentTypeUseCase extends HermeumConfigLoadable(BaseUseCase) {
  async list(): Promise<AgentTypeSummary[]> {
    const { agentTypes } = await this.loadHermeumConfig();
    return agentTypes
      ? Object.entries(agentTypes)
          .filter(([key]) => key !== DEFAULT_AGENT_TYPE_KEY)
          .map(([key, t]) => ({
            key,
            ...(t.description !== undefined ? { description: t.description } : {}),
          }))
      : [];
  }
}