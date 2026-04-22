import { z } from "zod";

export const ConfigSchema = z.object({
  databaseUrl: z.url(),
  agentConfigPath: z.string().default("./agent-config.yaml"),
});

export const config = ConfigSchema.parse({
  databaseUrl: process.env.CLAW_AGENT_DATABASE_URL,
  agentConfigPath: process.env.CLAW_AGENT_CONFIG_PATH,
});
