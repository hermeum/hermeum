import { z } from "zod";

// Agent-session telemetry vocabulary — the events hermes-agent emits to the
// Hermeum control plane (plugin protocol ingestion) and the trajectory UI
// renders. Mirrors the upstream langfuse observability plugin's post-call
// hook surface; kept in lockstep with the pinned hermes-agent submodule —
// reference: vendor/hermes-agent/plugins/observability/langfuse/README.md
// (plus __init__.py for the hook payloads). The submodule pointer implies
// the version; do not mention it here.
//
// Post-only by design: every event is a completed record (input, output,
// duration, usage arrive together). Pre-call events are deliberately omitted —
// the emitter computes durations locally, and completed records remove any
// server-side pre/post join.
//
// Payloads use `z.looseObject` so unknown fields pass through unvalidated
// instead of being silently stripped (same convention as `hermes-config/`).

const UsageSchema = z
  .looseObject({
    inputTokens: z
      .number()
      .int()
      .nonnegative()
      .describe("Prompt tokens, including cached reads/writes when reported."),
    outputTokens: z.number().int().nonnegative().describe("Completion tokens."),
    cacheReadTokens: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Input tokens served from the prompt cache."),
    cacheWriteTokens: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Input tokens written to the prompt cache."),
    reasoningTokens: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Tokens spent on hidden reasoning (when the provider reports it)."),
  })
  .describe("Token counts for one LLM request, summed over its API calls.");

const CostSchema = z
  .looseObject({
    totalUsd: z
      .number()
      .nullable()
      .describe(
        "Total estimated cost in USD; null when pricing is unknown. Partial component costs are never promoted to a total."
      ),
    inputUsd: z.number().nonnegative().optional().describe("Input-token cost component in USD."),
    outputUsd: z.number().nonnegative().optional().describe("Output-token cost component in USD."),
    cacheReadUsd: z
      .number()
      .nonnegative()
      .optional()
      .describe("Cache-read-token cost component in USD."),
    cacheWriteUsd: z
      .number()
      .nonnegative()
      .optional()
      .describe("Cache-write-token cost component in USD."),
  })
  .describe("Estimated cost breakdown in USD. Components may be absent when their rate is unknown.");

const ToolCallSchema = z
  .looseObject({
    id: z.string().describe("Provider-assigned tool-call id (e.g. OpenAI `tc_...`)."),
    name: z.string().optional().describe("Tool name."),
    arguments: z.unknown().optional().describe("Arguments the assistant passed to the tool."),
  })
  .describe("A tool invocation requested by the model.");

const AssistantSchema = z
  .looseObject({
    content: z.string().nullable().describe("Assistant message text; null when the message is tool calls only."),
    reasoning: z
      .string()
      .nullable()
      .optional()
      .describe("Visible chain-of-thought / reasoning summary, when the provider emits one."),
    toolCalls: z
      .array(ToolCallSchema)
      .describe("Tool invocations requested by this assistant message."),
  })
  .describe("Assistant turn output.");

const DurationSchema = z
  .number()
  .nonnegative()
  .describe(
    "Wall-clock duration in seconds (float). Omitted when the emitter could not time the call."
  );

const LlmCallEventSchema = z
  .looseObject({
    eventId: z.string().uuid().describe("Client-generated unique event id."),
    type: z.literal("llm_call"),
    timestamp: z.string().describe("ISO 8601 timestamp of when the event occurred."),
    turnId: z
      .string()
      .optional()
      .describe("Agent turn this call belongs to; groups llm/tool/error events into a trajectory."),
    provider: z.string().describe("Model provider (e.g. `openrouter`, `anthropic`)."),
    model: z.string().describe("Model identifier that served the request."),
    apiMode: z.string().describe("API style used (e.g. `completions`, `responses`, `converse`)."),
    durationS: DurationSchema.optional(),
    finishReason: z
      .string()
      .optional()
      .describe("Provider finish reason (e.g. `stop`, `tool_calls`, `length`)."),
    usage: UsageSchema.describe("Token counts for this LLM call."),
    cost: CostSchema.describe("Cost breakdown for this LLM call (null total when unknown)."),
    assistant: AssistantSchema.describe("The assistant output produced by this call."),
    moaReferences: z
      .array(
        z.looseObject({
          label: z.string().describe("Advisor label from the MoE-of-Agents fan-out."),
          model: z.string().describe("Model the advisor ran on."),
          output: z.unknown().optional().describe("Advisor output content."),
          usage: UsageSchema.optional(),
          costUsd: z.number().nonnegative().optional(),
        })
      )
      .optional()
      .describe(
        "Mixture-of-Agents advisor fan-outs dispatched alongside this call, when the aggregator reports them."
      ),
  })
  .describe("One completed LLM request: request metadata, usage, cost, and assistant output.");

const ToolCallEventSchema = z
  .looseObject({
    eventId: z.string().uuid().describe("Client-generated unique event id."),
    type: z.literal("tool_call"),
    timestamp: z.string().describe("ISO 8601 timestamp of when the event occurred."),
    turnId: z
      .string()
      .optional()
      .describe("Agent turn this call belongs to; groups llm/tool/error events into a trajectory."),
    toolName: z.string().describe("Name of the executed tool."),
    toolCallId: z.string().describe("Provider-assigned tool-call id this execution fulfilled."),
    args: z.unknown().describe("Arguments passed to the tool."),
    result: z.unknown().describe("Tool result. Sanitization/truncation is the emitter's responsibility."),
    durationS: DurationSchema.optional(),
    status: z
      .enum(["ok", "error", "blocked", "cancelled"])
      .optional()
      .describe(
        "Lifecycle outcome of the tool call (emitted even for blocked/cancelled paths so spans close cleanly)."
      ),
  })
  .describe("One completed tool execution.");

const ErrorEventSchema = z
  .looseObject({
    eventId: z.string().uuid().describe("Client-generated unique event id."),
    type: z.literal("error"),
    timestamp: z.string().describe("ISO 8601 timestamp of when the event occurred."),
    turnId: z
      .string()
      .optional()
      .describe("Agent turn this error belongs to; groups llm/tool/error events into a trajectory."),
    stage: z.enum(["llm", "tool"]).describe("Pipeline stage that failed."),
    message: z.string().describe("Error message."),
    provider: z.string().optional().describe("Model provider, when the error originated in an LLM call."),
    model: z.string().optional().describe("Model identifier, when the error originated in an LLM call."),
  })
  .describe("A failed LLM request or tool execution within a session.");

const SessionStartedEventSchema = z
  .looseObject({
    eventId: z.string().uuid().describe("Client-generated unique event id."),
    type: z.literal("session_started"),
    timestamp: z.string().describe("ISO 8601 timestamp of when the event occurred."),
    turnId: z.string().optional(),
    platform: z.string().describe("Hermes platform hosting the session (e.g. `api`, `cli`)."),
    provider: z.string().describe("Initial model provider for the session."),
    model: z.string().describe("Initial model for the session."),
    apiMode: z.string().describe("Initial API style (e.g. `completions`, `responses`, `converse`)."),
  })
  .describe("Session lifecycle: an agent session started.");

const SessionFinalizedEventSchema = z
  .looseObject({
    eventId: z.string().uuid().describe("Client-generated unique event id."),
    type: z.literal("session_finalized"),
    timestamp: z.string().describe("ISO 8601 timestamp of when the event occurred."),
    turnId: z.string().optional(),
    output: AssistantSchema.describe("Final assistant output that closed the session."),
  })
  .describe("Session lifecycle: the agent session finalized (final answer, no further tool calls).");

const SubagentEventFieldsSchema = z
  .looseObject({
    eventId: z.string().uuid().describe("Client-generated unique event id."),
    timestamp: z.string().describe("ISO 8601 timestamp of when the event occurred."),
    turnId: z.string().describe("Turn within the subagent session."),
    parentTurnId: z
      .string()
      .optional()
      .describe("Turn in the parent session that spawned this subagent; omitted when the emitter cannot know it."),
    childSessionId: z.string().uuid().describe("Session id of the spawned subagent."),
  })
  .describe("Shared fields for subagent lifecycle events.");

const SubagentStartedEventSchema = z
  .looseObject({
    eventId: SubagentEventFieldsSchema.shape.eventId,
    type: z.literal("subagent_started"),
    timestamp: SubagentEventFieldsSchema.shape.timestamp,
    turnId: SubagentEventFieldsSchema.shape.turnId,
    parentTurnId: SubagentEventFieldsSchema.shape.parentTurnId,
    childSessionId: SubagentEventFieldsSchema.shape.childSessionId,
  })
  .describe("Subagent lifecycle: a subagent session spawned from a parent turn.");

const SubagentStoppedEventSchema = z
  .looseObject({
    eventId: SubagentEventFieldsSchema.shape.eventId,
    type: z.literal("subagent_stopped"),
    timestamp: SubagentEventFieldsSchema.shape.timestamp,
    turnId: SubagentEventFieldsSchema.shape.turnId,
    parentTurnId: SubagentEventFieldsSchema.shape.parentTurnId,
    childSessionId: SubagentEventFieldsSchema.shape.childSessionId,
  })
  .describe("Subagent lifecycle: a spawned subagent session finished.");

export const AgentSessionEventSchema = z.discriminatedUnion("type", [
  SessionStartedEventSchema,
  LlmCallEventSchema,
  ToolCallEventSchema,
  ErrorEventSchema,
  SessionFinalizedEventSchema,
  SubagentStartedEventSchema,
  SubagentStoppedEventSchema,
]);

export type AgentSessionEvent = z.infer<typeof AgentSessionEventSchema>;

export const AgentSessionEventBatchSchema = z
  .object({
    sessionId: z
      .string()
      .uuid()
      .describe("Identifier of the agent session the events belong to."),
    events: z
      .array(AgentSessionEventSchema)
      .max(100)
      .describe("Batch of completed session events, in emission order."),
  })
  .describe("Ingestion payload: one batch of agent-session events for a single session.");

export type AgentSessionEventBatch = z.infer<typeof AgentSessionEventBatchSchema>;