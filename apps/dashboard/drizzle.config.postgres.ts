import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/server/infras/better-auth/schema.postgres.ts"],
  dbCredentials: {
    url: process.env.HERMEUM_DATABASE_URL!,
  },
  out: "./src/server/migrations/postgres",
});
