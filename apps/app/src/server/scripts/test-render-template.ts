/**
 * Test-only script: render the post-mutating-webhook HermesAgent CR for a
 * template id.
 *
 * Loads the Hermeum config (HERMEUM_CONFIG_PATH, default ./config.yaml),
 * instantiates the template, synthesizes an Agent (random id/userId), builds
 * the pre-webhook CR via agentToHermesAgent, applies the mutating webhook
 * JSON patch declared under the agent's type (first-match-wins against the
 * CR), and prints the resulting CR as YAML to stdout.
 *
 * Placeholders like {{agentId}} / {{userId}} are left verbatim — the real
 * webhook does not substitute them either.
 *
 * Usage:
 *   pnpm --filter @hermeum/app exec tsx src/server/scripts/render-template.ts <template-id>
 *
 * Env: a .env in the CWD is loaded by `@/server/libs/config` at import time;
 * HERMEUM_DATABASE_URL and friends must be present there (placeholder values
 * are fine for this test tool). HERMEUM_CONFIG_PATH selects the config file.
 * Runs without a kubeconfig — the Runtime adaptor is stubbed because the only
 * use-case methods invoked never reach the cluster.
 */
import { randomUUID } from "node:crypto";

import * as fastJsonPatch from "fast-json-patch";
import { stringify } from "yaml";

import { AgentInputSchema, Context, Template } from "@/entities";
import { ConsoleLogger } from "@/server/infras/console-logger";
import { HermesSkillIndex } from "@/server/infras/hermes-skill-index";
import { LocalFiles } from "@/server/infras/local-files";
import { agentToHermesAgent } from "@/server/infras/kubernetes/client";
import { config } from "@/server/libs/config";
import { Runtime } from "@/server/usecases/adaptors/runtime";
import { AgentUseCase } from "@/server/usecases/agent";
import { TemplateUseCase } from "@/server/usecases/template";

const { applyPatch } = fastJsonPatch.default ?? fastJsonPatch;

const templateId = process.argv[2];
if (!templateId) {
  console.error("Usage: tsx src/server/scripts/render-template.ts <template-id>");
  process.exit(1);
}

// Reuse the real file/logger/skill-index adaptors — none of them reach a
// cluster. Only the Runtime is stubbed: KubernetesClient.loadFromDefault()
// throws without kubeconfig, and the two methods this script calls
// (TemplateUseCase.get, AgentUseCase.getmutatingWebhookJsonPatch) never touch
// the runtime anyway.
const stubRuntime: Runtime = new Proxy({} as Runtime, {
  get() {
    throw new Error("Runtime must not be called by this script");
  },
});

const ctx: Context = { session: null, user: null };

const templateUseCase = new TemplateUseCase(stubRuntime, new LocalFiles(), new HermesSkillIndex(), new ConsoleLogger(config.logLevel));
const agentUseCase = new AgentUseCase(stubRuntime, new LocalFiles(), new HermesSkillIndex(), new ConsoleLogger(config.logLevel));

const template: Template | null = await templateUseCase.get(ctx, templateId);
if (!template) {
  console.error(`Template "${templateId}" not found in ${config.configPath}`);
  process.exit(1);
}

const agentInput = AgentInputSchema.parse(template.agentInput);
const agent = { ...agentInput, id: randomUUID(), userId: randomUUID() };

// Pre-webhook CR exactly as the reconciler would receive it.
const cr = agentToHermesAgent(agent);

// Apply the mutating webhook patch declared for the agent's type. The patch
// candidates' `test` ops are evaluated against `cr` (first-match-wins); a
// template without a `type` yields null (no mutation).
const patch = await agentUseCase.getmutatingWebhookJsonPatch(agent, cr);
let postWebhookCr = cr;
if (patch !== null && patch.length > 0) {
  const cloned = structuredClone(cr);
  // `JsonPatchOp` is a plain object schema; fast-json-patch expects its
  // discriminated `Operation` union. Cast through unknown to bridge them.
  applyPatch(cloned, patch as unknown as fastJsonPatch.Operation[]);
  postWebhookCr = cloned as typeof cr;
}

process.stdout.write(stringify(postWebhookCr));