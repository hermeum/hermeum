import { z } from "zod";

// ─── Metadata ────────────────────────────────────────────────────────────────

export const ObjectMetaSchema = z.object({
  name: z.string().min(1),
  namespace: z.string().min(1).default("default"),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
  uid: z.string().optional(),
  resourceVersion: z.string().optional(),
  creationTimestamp: z.string().datetime().optional(),
});

export type ObjectMeta = z.infer<typeof ObjectMetaSchema>;

// ─── Agent Sandbox Spec ──────────────────────────────────────────────────────

export const ContainerSpecSchema = z.object({
  image: z.string().min(1),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  env: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  resources: z
    .object({
      requests: z.object({ cpu: z.string().optional(), memory: z.string().optional() }).optional(),
      limits: z.object({ cpu: z.string().optional(), memory: z.string().optional() }).optional(),
    })
    .optional(),
});

export type ContainerSpec = z.infer<typeof ContainerSpecSchema>;

export const SandboxPhase = z.enum(["Pending", "Running", "Succeeded", "Failed", "Terminating"]);

export type SandboxPhase = z.infer<typeof SandboxPhase>;

export const SandboxSpecSchema = z.object({
  /** Singleton key — only one sandbox per (namespace, key) is allowed */
  singletonKey: z.string().min(1),
  container: ContainerSpecSchema,
  /** Seconds before an idle sandbox is reaped. Default: 3600 */
  ttlSeconds: z.number().int().positive().default(3600),
  /** Whether to keep the pod after completion for log inspection */
  retainOnCompletion: z.boolean().default(false),
});

export type SandboxSpec = z.infer<typeof SandboxSpecSchema>;

export const SandboxStatusSchema = z.object({
  phase: SandboxPhase.default("Pending"),
  podName: z.string().optional(),
  startTime: z.string().datetime().optional(),
  completionTime: z.string().datetime().optional(),
  message: z.string().optional(),
  conditions: z
    .array(
      z.object({
        type: z.string(),
        status: z.enum(["True", "False", "Unknown"]),
        reason: z.string().optional(),
        message: z.string().optional(),
        lastTransitionTime: z.string().datetime().optional(),
      })
    )
    .optional(),
});

export type SandboxStatus = z.infer<typeof SandboxStatusSchema>;

// ─── Full Resource ────────────────────────────────────────────────────────────

export const AgentSandboxSchema = z.object({
  apiVersion: z.literal("kubebox.dev/v1alpha1"),
  kind: z.literal("AgentSandbox"),
  metadata: ObjectMetaSchema,
  spec: SandboxSpecSchema,
  status: SandboxStatusSchema.optional(),
});

export type AgentSandbox = z.infer<typeof AgentSandboxSchema>;

// ─── Input DTOs ───────────────────────────────────────────────────────────────

export const CreateSandboxInputSchema = z.object({
  name: z.string().min(1),
  namespace: z.string().min(1).default("default"),
  spec: SandboxSpecSchema,
});

export type CreateSandboxInput = z.infer<typeof CreateSandboxInputSchema>;

export const ListSandboxesInputSchema = z.object({
  namespace: z.string().min(1).optional(),
  labelSelector: z.string().optional(),
  phase: SandboxPhase.optional(),
});

export type ListSandboxesInput = z.infer<typeof ListSandboxesInputSchema>;
