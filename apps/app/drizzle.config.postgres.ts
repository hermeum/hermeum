import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/server/routers/better-auth/schema.postgres.ts",
    "./src/server/infras/postgres/schema.ts",
  ],
  dbCredentials: {
    url: process.env.HERMEUM_DATABASE_URL!,
  },
  out: "./src/server/migrations/postgres",
});
