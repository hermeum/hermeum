import { createAuthClient } from "better-auth/react";

import type { Session, User } from "@/entities";

const client = createAuthClient({ basePath: "/auth" });

export type SessionData = { session: Session; user: User };

export interface AuthClient {
  signIn(args: { email: string; password: string }): Promise<void>;
  getSession(): Promise<{ data: SessionData | null }>;
  signOut(): Promise<unknown>;
}

class BetterAuthClient implements AuthClient {
  async signIn({ email, password }: { email: string; password: string }) {
    const { error } = await client.signIn.email({ email, password });
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

export function useSession() {
  return client.useSession() as {
    data: SessionData | null;
    isPending: boolean;
    error: unknown;
    refetch: () => void;
  };
}
