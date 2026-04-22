import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import nodemailer from "nodemailer";

import { config } from "@/server/config";

const client = postgres(config.databaseUrl);
export const db = drizzle(client);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (config.nodeEnv !== "production") {
          console.log(`[magic-link] ${email} → ${url}`);
          return;
        }

        const transporter = nodemailer.createTransport(config.smtpUrl);
        await transporter.sendMail({
          to: email,
          subject: "Sign in to ClawAgent",
          text: `Sign in: ${url}`,
          html: `<p>Click <a href="${url}">here</a> to sign in to KubeClaw.</p>`,
        });
      },
    }),
  ],
});
