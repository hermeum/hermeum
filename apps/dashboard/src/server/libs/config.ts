import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

export const ConfigSchema = z.object({
  agentConfigPath: z.string().default("./agent-config.yaml"),
  databaseUrl: z.url(),
  kubernetesNamespace: z.string().default("hermeum"),
  smtpUrl: z.url().optional(),
  allowedEmailDomain: z.string().optional(),
  hermesImageRepository: z.string().default("nousresearch/hermes-agent"),
  hermesImageTag: z.string().default("v2026.6.19"),
  aiModel: z
    .string()
    .regex(/^[\w.-]+:.+$/, 'Expected "provider:model", e.g. "anthropic:claude-sonnet-5"')
    .optional(),
  aiBaseUrl: z.url().optional(),
});

export const config = ConfigSchema.parse({
  agentConfigPath: process.env.HERMEUM_CONFIG_PATH,
  databaseUrl: process.env.HERMEUM_DATABASE_URL,
  kubernetesNamespace: process.env.HERMEUM_KUBERNETES_NAMESPACE,
  smtpUrl: process.env.HERMEUM_SMTP_URL,
  allowedEmailDomain: process.env.HERMEUM_ALLOWED_EMAIL_DOMAIN,
  hermesImageRepository: process.env.HERMEUM_HERMES_IMAGE_REPOSITORY,
  hermesImageTag: process.env.HERMEUM_HERMES_IMAGE_TAG,
  aiModel: process.env.HERMEUM_AI_MODEL,
  aiBaseUrl: process.env.HERMEUM_AI_BASE_URL,
});
