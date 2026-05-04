import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import nodemailer from "nodemailer";

import { config } from "@/server/libs/config";
import * as schema from "./schema";

const client = postgres(config.databaseUrl);
export const db = drizzle(client, { schema });

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
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
