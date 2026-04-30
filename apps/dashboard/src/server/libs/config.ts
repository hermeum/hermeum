import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

export const ConfigSchema = z.object({
  databaseUrl: z.url(),
  agentConfigPath: z.string().default("./agent-config.yaml"),
  smtpUrl: z.url().optional(),
  allowedEmailDomain: z.string().optional(),
});

export const config = ConfigSchema.parse({
  databaseUrl: process.env.CLAW_AGENT_DATABASE_URL,
  agentConfigPath: process.env.CLAW_AGENT_CONFIG_PATH,
  smtpUrl: process.env.CLAW_AGENT_SMTP_URL,
  allowedEmailDomain: process.env.CLAW_AGENT_ALLOWED_EMAIL_DOMAIN,
});
