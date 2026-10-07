import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./src/server/routers/better-auth/schema.sqlite.ts",
    "./src/server/infras/sqlite/schema.ts",
  ],
  dbCredentials: {
    url: process.env.HERMEUM_DATABASE_URL!,
  },
  out: "./src/server/migrations/sqlite",
});
