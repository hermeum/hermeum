// Batch generation script: runs the real AgentUseCase.generateAgentInput()
// pipeline against every prompt below and prints the generated JSON.
//
// Usage:
//   pnpm eval
//   HERMEUM_OPENAI_MODEL=gpt-4o pnpm eval
//
// Requires HERMEUM_OPENAI_MODEL (or the default) and a valid API key in env.

import { AiSdkGenerator } from "@/server/infras/ai-sdk";
import { AgentUseCase } from "@/server/usecases/agent";
import type { ConfigAdaptor } from "@/server/usecases/adaptors/config";
import type { Context, HermeumConfig } from "@/entities";

// ── Prompts ───────────────────────────────────────────────────
// Edit this list freely — each string is a natural-language agent
// description, the same thing you'd type into the "Describe your
// agent" UI box.

const PROMPTS: string[] = [
  "Summarize documents I paste in",
  "Review GitHub pull requests and comment with feedback",
  "Send a daily standup summary to Slack every morning at 9am",
  "A Slack bot that answers questions about our docs",
  "Expose an API endpoint that returns stock prices for a given ticker",
  "An agent that uses Claude via OpenRouter",
  "An agent",
  "An agent that monitors GitHub issues, reviews PRs, posts daily summaries to Slack, and uses Python for data analysis",
];

const stubConfig: ConfigAdaptor = {
  get(): HermeumConfig {
    return { agentTypes: undefined, templates: [] };
  },
};

const stubCtx: Context = {
  session: { id: "eval-session", userId: "eval-user", expiresAt: new Date() },
  user: { id: "eval-user", email: "eval@hermeum.local", name: "Eval", createdAt: new Date() },
};

// ── ANSI helpers ──────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const dim = (s: string) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const green = (s: string) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s);
const red = (s: string) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const yellow = (s: string) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s);

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const useCase = new AgentUseCase(undefined, stubConfig, new AiSdkGenerator());

  const sep = "═".repeat(60);
  const thin = "─".repeat(60);

  console.log();
  console.log(bold(sep));
  console.log(bold("  Hermeum Generation Batch"));
  console.log(`  Model: ${process.env.HERMEUM_OPENAI_MODEL ?? "gpt-5.5"}  |  Prompts: ${PROMPTS.length}`);
  console.log(bold(sep));
  console.log();

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i]!;
    const label = `#${i + 1}  ${prompt}`;

    console.log(bold(label));
    console.log(dim(thin));

    try {
      const output = await useCase.generateAgentInput(stubCtx, prompt);
      succeeded++;
      console.log(JSON.stringify(output, null, 2));
    } catch (e) {
      failed++;
      console.log(red(`  ERROR: ${e instanceof Error ? e.message : String(e)}`));
    }

    console.log();
  }

  console.log(dim(thin));
  const summary = `  Summary: ${succeeded}/${PROMPTS.length} succeeded, ${failed} failed`;
  console.log(failed > 0 ? yellow(bold(summary)) : green(bold(summary)));
  console.log(dim(sep));
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});