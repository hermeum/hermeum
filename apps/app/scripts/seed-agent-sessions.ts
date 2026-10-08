import DatabaseClient from "better-sqlite3";
import { randomUUID } from "node:crypto";

import {
  AgentSessionEventSchema,
  type AgentSessionEvent,
} from "../src/entities/telemetry";

// Seeds the local SQLite database with mock agent-session events so the
// session views (sessions tab + session page) can be exercised without a
// live hermes agent emitting telemetry.
//
// Usage:
//   HERMEUM_DATABASE_URL=file:./sqlite.db pnpm exec tsx scripts/seed-agent-sessions.ts <agentId>
//
// The agent id must exist in the Runtime the server sees (with
// HERMEUM_MOCK_RUNTIME=true, create the agent in the UI first and copy its id)
// — session reads are ownership-guarded through the runtime agent lookup.

const USAGE = { inputTokens: 812, outputTokens: 356 } as const;

function iso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

function llmCall(event: {
  at: string;
  turnId: string;
  userMessage?: string;
  content: string | null;
  reasoning?: string | null;
  durationS?: number;
}): Extract<AgentSessionEvent, { type: "llm_call" }> {
  return {
    eventId: randomUUID(),
    type: "llm_call",
    timestamp: event.at,
    turnId: event.turnId,
    ...(event.userMessage !== undefined ? { userMessage: event.userMessage } : {}),
    provider: "openai",
    model: "gpt-4.1-mini",
    apiMode: "completions",
    ...(event.durationS !== undefined ? { durationS: event.durationS } : {}),
    finishReason: "stop",
    usage: { ...USAGE, cacheReadTokens: 128 },
    cost: { totalUsd: 0.0021, inputUsd: 0.0008, outputUsd: 0.0013 },
    assistant: {
      content: event.content,
      ...(event.reasoning != null ? { reasoning: event.reasoning } : {}),
      toolCalls: [],
    },
  };
}

function toolCall(event: {
  at: string;
  turnId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  durationS: number;
  status?: "ok" | "error";
}): Extract<AgentSessionEvent, { type: "tool_call" }> {
  return {
    eventId: randomUUID(),
    type: "tool_call",
    timestamp: event.at,
    turnId: event.turnId,
    toolName: event.toolName,
    toolCallId: `tc_${randomUUID().slice(0, 8)}`,
    args: event.args,
    result: event.result,
    durationS: event.durationS,
    ...(event.status !== undefined ? { status: event.status } : {}),
  };
}

// A short greeting exchange, then a tool-using turn styled after a real
// "which tools do you have?" trajectory: reasoning, a couple of tool calls,
// then a markdown answer with sections, bullets and inline code.
function buildDemoSession(baseOffsetMs: number): AgentSessionEvent[] {
  // Larger arg = further in the past; +0 = now.
  const t = (msAgo: number): string => iso(baseOffsetMs + msAgo);

  return [
    {
      eventId: randomUUID(),
      type: "session_started",
      timestamp: t(120_000),
      platform: "api",
      provider: "openai",
      model: "gpt-4.1-mini",
      apiMode: "completions",
    },
    llmCall({
      at: t(119_800),
      turnId: "turn-1",
      userMessage: "Hello!",
      content: "Hi! What can I help you with today?",
      durationS: 0.4,
    }),
    llmCall({
      at: t(105_000),
      turnId: "turn-2",
      userMessage: "which tools do you have?",
      durationS: 1.4,
      reasoning:
        "The user wants an overview of my capabilities. I should list my tools grouped by purpose, keeping each entry to one line.",
      content: `I have access to a set of tools that let me act as a general-purpose agent. Here's what I can do:

## File operations

- \`read\` — view contents of files (text, images, PDFs)
- \`write\` — create new files or fully overwrite existing ones
- \`edit\` — make precise, targeted edits to a file by replacing exact text
- \`glob\` — find files by name/path patterns (e.g. \`**/*.py\`)
- \`grep\` — search file contents using regex (powered by ripgrep)

## System/execution

- \`bash\` — run shell commands (builds, git, package managers, scripts, process management, etc.), including in the background for long-running tasks

## Web

- \`fetch\` — download a URL and return its contents as markdown

Let me know what you'd like to do and I'll pick the right tool for it.`,
    }),
    toolCall({
      at: t(104_100),
      turnId: "turn-2",
      toolName: "read",
      args: { path: "README.md" },
      result: { ok: true, lines: 42 },
      durationS: 0.2,
    }),
    toolCall({
      at: t(103_900),
      turnId: "turn-2",
      toolName: "glob",
      args: { pattern: "src/**/*.ts" },
      result: { matches: 17 },
      durationS: 0.1,
    }),
    {
      eventId: randomUUID(),
      type: "session_finalized",
      timestamp: t(102_000),
      output: { content: "Tool overview provided.", toolCalls: [] },
    },
  ];
}

// A longer trajectory: a failing tool call and a pipeline error, then
// recovery on the next turn — exercises the error paths of the UI.
function buildRetrySession(baseOffsetMs: number): AgentSessionEvent[] {
  const t = (msAgo: number): string => iso(baseOffsetMs + msAgo);

  return [
    {
      eventId: randomUUID(),
      type: "session_started",
      timestamp: t(300_000),
      platform: "api",
      provider: "openai",
      model: "gpt-4.1-mini",
      apiMode: "completions",
    },
    llmCall({
      at: t(298_000),
      turnId: "turn-1",
      userMessage: "Run the test suite and tell me what's failing.",
      durationS: 0.6,
      content: null,
    }),
    toolCall({
      at: t(296_000),
      turnId: "turn-1",
      toolName: "bash",
      args: { command: "pnpm test" },
      result: { exitCode: 1, tail: "ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL" },
      durationS: 12.3,
      status: "error",
    }),
    {
      eventId: randomUUID(),
      type: "error",
      timestamp: t(295_500),
      turnId: "turn-1",
      stage: "tool",
      message: "Command exited with code 1 before producing output",
    },
    llmCall({
      at: t(290_000),
      turnId: "turn-2",
      userMessage: "Try installing dependencies first.",
      content: `Dependencies weren't installed in the sandbox. After running \`pnpm install\`, the suite passes:

- **34 passed** across 6 test files
- 1 pre-existing flake in \`local-files.test.ts\` (unrelated)

Everything is green now — want me to wire the install step into CI?`,
      durationS: 2.1,
    }),
    toolCall({
      at: t(288_000),
      turnId: "turn-2",
      toolName: "bash",
      args: { command: "pnpm install && pnpm test" },
      result: { exitCode: 0, passed: 34, failed: 0 },
      durationS: 45.7,
    }),
  ];
}

const main = async (): Promise<void> => {
  const agentId = process.argv[2];
  if (!agentId) {
    console.error("Usage: tsx scripts/seed-agent-sessions.ts <agentId>");
    process.exit(1);
  }

  const databaseUrl = process.env.HERMEUM_DATABASE_URL ?? "file:./sqlite.db";
  const dbPath = databaseUrl.replace(/^file:(\/\/)?/, "");
  const db = new DatabaseClient(dbPath);

  const sessions: [string, AgentSessionEvent[]][] = [
    ["demo_greeting_and_tools", buildDemoSession(0)],
    ["demo_test_run", buildRetrySession(600_000)],
  ];

  const insert = db.prepare(
    `INSERT INTO agent_session_events (id, agent_id, session_id, event_id, type, timestamp, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  let total = 0;
  for (const [sessionId, events] of sessions) {
    // Validate against the live entity schema — the transcript UI skips
    // payloads that fail it, so seeding invalid rows would silently no-op.
    for (const event of events) {
      const parsed = AgentSessionEventSchema.safeParse(event);
      if (!parsed.success) {
        throw new Error(`Mock event failed schema validation: ${parsed.error.message}`);
      }
    }
    // Delete any previous seed of the same session id so the script is
    // idempotent while iterating on the mock data.
    db.prepare("DELETE FROM agent_session_events WHERE agent_id = ? AND session_id = ?").run(
      agentId,
      sessionId
    );
    for (const event of events) {
      insert.run(
        randomUUID(),
        agentId,
        sessionId,
        event.eventId,
        event.type,
        new Date(event.timestamp).getTime(),
        JSON.stringify(event)
      );
    }
    console.info(`Seeded ${events.length} events into session ${sessionId}`);
    total += events.length;
  }

  db.close();
  console.info(`Done — ${total} events for agent ${agentId}`);
};

void main();