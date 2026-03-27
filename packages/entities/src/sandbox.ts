import { z } from "zod";

export const StatusSchema = z.enum(["success", "failed", "pending"]);

export type Status = z.infer<typeof StatusSchema>;

export const SandboxSchema = z.object({
  name: z.string().min(1),
  shutdownTime: z.string().datetime().optional(),
  paused: z.boolean(),
  status: StatusSchema,
});

export type Sandbox = z.infer<typeof SandboxSchema>;

export const SandboxClaimSchema = z.object({
  name: z.string().min(1),
  sandboxTemplate: z.string().min(1),
  status: StatusSchema,
});

export type SandboxClaim = z.infer<typeof SandboxClaimSchema>;

// ─── Input DTOs ───────────────────────────────────────────────────────────────

export const CreateSandboxInputSchema = z.object({
  name: z.string().min(1),
  sandboxTemplate: z.string().min(1),
});

export type CreateSandboxInput = z.infer<typeof CreateSandboxInputSchema>;
