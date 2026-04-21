import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/server/infras/better-auth/schema.ts"],
  dbCredentials: {
    url: process.env.CLAW_AGENT_DATABASE_URL!,
  },
  out: "./src/server/migrations",
});
