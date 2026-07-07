import { AgentInput } from "@/entities";

// Single LLM-call primitive. The usecase composes the system and user
// prompts; the implementation owns model selection and structured-output
// mechanics.
export interface AiGenerator {
  generateAgentInput(input: { system: string; prompt: string }): Promise<AgentInput>;
}
