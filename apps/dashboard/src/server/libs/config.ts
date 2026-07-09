import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

export const ConfigSchema = z.object({
  agentConfigPath: z.string().default("./agent-config.yaml"),
  databaseDialect: z.enum(["postgres", "sqlite"]).default("sqlite"),
  databaseUrl: z.url(),
  kubernetesNamespace: z.string().default("hermeum"),
  smtpUrl: z.url().optional(),
  allowedEmailDomain: z.string().optional(),
  hermesImageRepository: z.string().default("nousresearch/hermes-agent"),
  hermesImageTag: z.string().default("v2026.6.19"),
  openaiModel: z.string().min(1).default("gpt-5.5"),
  openaiBaseUrl: z.url().optional(),
});

export const config = ConfigSchema.parse({
  agentConfigPath: process.env.HERMEUM_CONFIG_PATH,
  databaseDialect: process.env.HERMEUM_DATABASE_DIALECT,
  databaseUrl: process.env.HERMEUM_DATABASE_URL,
  kubernetesNamespace: process.env.HERMEUM_KUBERNETES_NAMESPACE,
  smtpUrl: process.env.HERMEUM_SMTP_URL,
  allowedEmailDomain: process.env.HERMEUM_ALLOWED_EMAIL_DOMAIN,
  hermesImageRepository: process.env.HERMEUM_HERMES_IMAGE_REPOSITORY,
  hermesImageTag: process.env.HERMEUM_HERMES_IMAGE_TAG,
  openaiModel: process.env.HERMEUM_OPENAI_MODEL,
  openaiBaseUrl: process.env.HERMEUM_OPENAI_BASE_URL,
});
