import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/server/infras/better-auth/schema.sqlite.ts"],
  dbCredentials: {
    url: process.env.HERMEUM_DATABASE_URL!,
  },
  out: "./src/server/migrations/sqlite",
});
