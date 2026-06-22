import { z } from "zod";

export const WorkspaceFilesSchema = z.record(z.string(), z.string()).optional();

export type WorkspaceFiles = z.infer<typeof WorkspaceFilesSchema>;

export const SkillSchema = z
  .string()
  .min(1)
  .max(128, "Skill exceeds maximum length of 128 characters")
  .regex(
    /^[a-zA-Z0-9@\-_/.:]+$/,
    "Skill contains invalid characters. Allowed: alphanumeric, -, _, /, ., @"
  )
  .refine((s) => s !== "npm:" && s !== "pack:", "Skill cannot be a bare prefix");

export type Skill = string;

export const SkillsSchema = z.array(SkillSchema).max(20).optional();

export type Skills = z.infer<typeof SkillsSchema>;

export const PluginsSchema = z.array(z.string()).max(20).optional();

export type Plugins = z.infer<typeof PluginsSchema>;

export const StorageSchema = z
  .object({
    enabled: z.boolean().default(true),
    size: z.string().min(1),
    storageClass: z.string().optional(),
  })
  .optional();

export type Storage = z.infer<typeof StorageSchema>;

export const ConfigSchema = z.record(z.string(), z.unknown()).optional();

export type Config = z.infer<typeof ConfigSchema>;

export const SelfConfigActionSchema = z.enum(["skills", "config", "soul", "envVars"]);

export type SelfConfigAction = z.infer<typeof SelfConfigActionSchema>;

export const SelfConfigureSchema = z
  .object({
    enabled: z.boolean().default(false).optional(),
    allowedActions: z.array(SelfConfigActionSchema).max(4).optional(),
  })
  .optional();

export type SelfConfigure = z.infer<typeof SelfConfigureSchema>;

export const EnvVarSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[-._a-zA-Z0-9]+$/,
      "A environment variable name must consist of alphanumeric characters, '-', '_' or '.'"
    ),
  value: z.string(),
});

export type EnvVar = z.infer<typeof EnvVarSchema>;

export const AgentInputSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  version: z.string().optional(),
  config: ConfigSchema,
  envVars: z.array(EnvVarSchema).optional(),
  secrets: z.array(z.string()).optional(),
  soul: z.string().optional(),
  skills: SkillsSchema,
  plugins: PluginsSchema,
});

export type AgentInput = z.infer<typeof AgentInputSchema>;

export const AgentPhaseSchema = z.enum([
  "Pending",
  "Running",
  "Succeeded",
  "Failed",
  "Unknown",
  "Suspended",
]);
export type AgentPhase = z.infer<typeof AgentPhaseSchema>;

export const AgentSchema = AgentInputSchema.extend({
  id: z.string().min(1),
  userId: z.string().min(1),
  suspended: z.boolean().optional(),
  phase: AgentPhaseSchema.optional(),
  createdAt: z.date().optional(),
}).readonly();

export type Agent = z.infer<typeof AgentSchema>;
