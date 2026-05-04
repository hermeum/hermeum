import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

export const ConfigSchema = z.object({
  agentConfigPath: z.string().default("./agent-config.yaml"),
  databaseUrl: z.url(),
  kubernetesNamespace: z.string().default("clawagent"),
  smtpUrl: z.url().optional(),
  allowedEmailDomain: z.string().optional(),
});

export const config = ConfigSchema.parse({
  agentConfigPath: process.env.CLAW_AGENT_CONFIG_PATH,
  databaseUrl: process.env.CLAW_AGENT_DATABASE_URL,
  kubernetesNamespace: process.env.CLAW_AGENT_KUBERNETES_NAMESPACE,
  smtpUrl: process.env.CLAW_AGENT_SMTP_URL,
  allowedEmailDomain: process.env.CLAW_AGENT_ALLOWED_EMAIL_DOMAIN,
});
