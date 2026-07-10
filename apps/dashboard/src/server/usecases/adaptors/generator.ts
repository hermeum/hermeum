import { z } from "zod";

import { AgentInput } from "@/entities";

// Kept independent of the `ai` package's own `Tool`/`ToolSet` types so this
// adaptor boundary has no AI-SDK-specific dependency; implementations adapt
// it to whatever the underlying SDK expects.
export interface AiGeneratorTool<TInput = unknown> {
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput) => unknown | Promise<unknown>;
}

// Single LLM-call primitive. The usecase composes the system and user
// prompts; the implementation owns model selection and structured-output
// mechanics.
export interface AiGenerator {
  generateAgentInput(input: {
    system: string;
    prompt: string;
    // `any` here (matching the `ai` package's own `ToolSet`) is what lets a
    // single record hold tools with different input types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools?: Record<string, AiGeneratorTool<any>>;
  }): Promise<AgentInput>;
}
