import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { config } from "@/server/libs/config";
import * as schema from "./schema";

const client = postgres(config.databaseUrl);
export const db = drizzle(client, { schema });

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  basePath: "/auth",
});
