import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

import type { Session, User } from "@/entities";

const client = createAuthClient({
  basePath: "/auth",
  plugins: [magicLinkClient()],
});

export type SessionData = { session: Session; user: User };

export interface AuthClient {
  sendMagicLink(params: { email: string; callbackURL?: string }): Promise<void>;
  getSession(): Promise<{ data: SessionData | null }>;
  signOut(): Promise<unknown>;
}

class BetterAuthClient implements AuthClient {
  async sendMagicLink({ email, callbackURL }: { email: string; callbackURL?: string }) {
    const { error } = await client.signIn.magicLink({ email, callbackURL });
    if (error) {
      throw error;
    }
  }

  async getSession() {
    const { data, error } = await client.getSession();
    if (error) {
      throw error;
    }

    return { data };
  }

  async signOut() {
    return await client.signOut();
  }
}

export const authClient: AuthClient = new BetterAuthClient();

