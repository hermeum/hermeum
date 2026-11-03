import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.date(),
});
export type Session = z.infer<typeof SessionSchema>;

export const ContextSchema = z.object({
  session: SessionSchema.nullable(),
  user: UserSchema.nullable(),
});
export type Context = z.infer<typeof ContextSchema>;

// Single source of truth for the anonymous-user identity, shared by the server
// (which synthesizes this user when auth is disabled) and the client (which
// renders it in the sidebar) so the two can't drift.
export const anonymousUser = {
  id: "anonymous-user",
  email: "anonymous@hermeum.local",
  name: "Anonymous",
} as const;
