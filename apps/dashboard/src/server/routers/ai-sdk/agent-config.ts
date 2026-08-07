import { Router } from "express";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, UIMessage, type ToolSet as AiToolSet } from "ai";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";

import { AgentInputObjectSchema, type ToolSet } from "@/entities";
import { config } from "@/server/libs/config";
import { auth } from "@/server/routers/better-auth/auth.js";
import { ChatUseCase } from "@/server/usecases/chat";

// Adapts the framework-neutral ToolSet (entity) into ai-sdk's ToolSet at the
// framework boundary. ai-sdk's `tool()` is an identity at runtime; the entity
// Tool's shape (description + inputSchema + optional execute) is structurally
// compatible with ai-sdk's FunctionTool, so a cast is sufficient and avoids the
// `tool()` factory's INPUT-inference overloads (which can't recover a specific
// INPUT from a ToolSet element widened to `Tool<any>`). Use cases depend only
// on the entity port; ai-sdk stays confined to this router.
function toAiToolSet(tools: ToolSet): AiToolSet {
  return tools as unknown as AiToolSet;
}

const ChatRequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  // AgentInputObjectSchema (no superRefine) so half-finished drafts are accepted.
  config: AgentInputObjectSchema.optional(),
});

// Lazy: built on first use so the dashboard boots without any AI config
// and fails with a clear error only when the feature is called.
let openai: ReturnType<typeof createOpenAI> | undefined;

function model() {
  if (!config.openaiModel) {
    throw new Error(
      "AI config generation is not configured: set HERMEUM_OPENAI_MODEL to an " +
        'OpenAI model id, e.g. "gpt-5.5".'
    );
  }
  const baseURL = config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {};
  openai ??= createOpenAI(baseURL);
  return openai(config.openaiModel);
}

const usecase = new ChatUseCase();

export const aiSdkRouter = Router();

aiSdkRouter.post("/agent-config", async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = ChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" });
    return;
  }

  const { instructions, prompt, tools } = await usecase.getAgentConfigContext(parsed.data.config);
  const result = streamText({
    model: model(),
    system: `${instructions}\n\n${prompt}`,
    messages: await convertToModelMessages(parsed.data.messages),
    tools: toAiToolSet(tools),
    // AgentInputObjectSchema uses looseObject/record/optionals, which strict
    // JSON schema mode rejects; Responses API models default it to true.
    providerOptions: {
      openai: { strictJsonSchema: false },
    },
    ...(config.debugMode && {
      onStepFinish: ({ stepNumber, finishReason, toolCalls, text, usage }) => {
        const toolsCalled = toolCalls.map((c) => c.toolName).join(",") || "-";
        const preview = text.slice(0, 80).replace(/\n/g, " ");
        console.info(
          `[ai-sdk] step ${stepNumber} finish=${finishReason} ` +
            `tools=[${toolsCalled}] tokens=${usage.totalTokens ?? "?"} ` +
            `text="${preview}${text.length > 80 ? "…" : ""}"`
        );
      },
    }),
  });
  result.pipeUIMessageStreamToResponse(res);
});
