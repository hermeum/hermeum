import { z } from "zod";

export const SandboxStatus = z.enum([
  "PodSchedule",
  "PodReadyToStartContainers",
  "ContainersReady",
  "Initialized",
  "Ready",
  "DisruptionTarget",
  "PodResizePending",
]);

export type SandboxStatus = z.infer<typeof SandboxStatus>;

export const SandboxSchema = z.object({
  name: z.string().min(1),
  shutdown: z.string().datetime(),
  status: SandboxStatus,
});

export type Sandbox = z.infer<typeof SandboxSchema>;

// ─── Input DTOs ───────────────────────────────────────────────────────────────

export const CreateSandboxInputSchema = z.object({
  sandboxTemplate: z.string().min(1),
});

export type CreateSandboxInput = z.infer<typeof CreateSandboxInputSchema>;
