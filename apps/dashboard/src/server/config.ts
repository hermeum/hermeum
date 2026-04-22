import { z } from "zod";

export const ConfigSchema = z.object({
  databaseUrl: z.url(),
  agentConfigPath: z.string().default("./agent-config.yaml"),
  nodeEnv: z.string().default("development"),
  smtpUrl: z.url().optional(),
});

export const config = ConfigSchema.parse({
  databaseUrl: process.env.CLAW_AGENT_DATABASE_URL,
  agentConfigPath: process.env.CLAW_AGENT_AGENT_CONFIG_PATH,
  nodeEnv: process.env.NODE_ENV,
  smtpUrl: process.env.CLAW_AGENT_SMTP_URL,
});
