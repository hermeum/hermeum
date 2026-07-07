import { AgentInput } from "@/entities";

// Single LLM-call primitive. The usecase composes prompts; the implementation
// owns the system prompt, model selection, and structured-output mechanics.
export interface ConfigGenerator {
  generate(prompt: string): Promise<AgentInput>;
}
