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
