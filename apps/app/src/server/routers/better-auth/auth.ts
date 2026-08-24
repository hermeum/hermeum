import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import postgres from "postgres";
import Database from "better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import nodemailer from "nodemailer";

import { config } from "@/server/libs/config";
import * as pgSchema from "./schema.postgres";
import * as sqliteSchema from "./schema.sqlite";

function createAdapter() {
  if (config.databaseDialect === "sqlite") {
    // Accept both "file:./path.db" and "file:///abs/path.db" forms
    const client = new Database(config.databaseUrl.replace(/^file:(\/\/)?/, ""));
    const db = drizzleSqlite(client, { schema: sqliteSchema });
    return drizzleAdapter(db, { provider: "sqlite", schema: sqliteSchema });
  }

  const client = postgres(config.databaseUrl);
  const db = drizzlePg(client, { schema: pgSchema });
  return drizzleAdapter(db, { provider: "pg", schema: pgSchema });
}

export const auth = betterAuth({
  database: createAdapter(),
  basePath: "/auth",
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email-otp/send-verification-otp") {
        return;
      }

      // If allowedEmailDomain is set, only allow sending OTP to emails with that domain
      if (config.allowedEmailDomain) {
        const email: string = ctx.body?.email ?? "";
        if (!email.endsWith(`@${config.allowedEmailDomain}`)) {
          throw new APIError("FORBIDDEN", {
            message: `Only @${config.allowedEmailDomain} accounts are allowed`,
          });
        }
      }
    }),
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        if (process.env.NODE_ENV === "development" || !config.smtpUrl) {
          console.log(`[OTP] ${email}: ${otp}`);
          return;
        }
        const transporter = nodemailer.createTransport(config.smtpUrl);
        await transporter.sendMail({
          to: email,
          subject: "Your login code",
          text: `Your one-time login code is: ${otp}`,
        });
      },
    }),
  ],
});
