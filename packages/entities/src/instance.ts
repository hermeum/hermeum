import { z } from "zod";

export const WorkspaceFilesSchema = z.record(z.string()).optional();

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

export const OpenClawJsonSchema = z.record(z.unknown()).optional();

export type OpenClawJson = z.infer<typeof OpenClawJsonSchema>;

export const SelfConfigActionSchema = z.enum(["skills", "config", "workspaceFiles", "envVars"]);

export type SelfConfigAction = z.infer<typeof SelfConfigActionSchema>;

export const SelfConfigureSchema = z
  .object({
    enabled: z.boolean().default(false).optional(),
    allowedActions: z.array(SelfConfigActionSchema).max(4).optional(),
  })
  .optional();

export type SelfConfigure = z.infer<typeof SelfConfigureSchema>;

export const EnvVarSchema = z.object({
  name: z.string().min(1),
  value: z.string(),
});

export type EnvVar = z.infer<typeof EnvVarSchema>;

export const EnvSchema = z.array(EnvVarSchema).optional();

export type Env = z.infer<typeof EnvSchema>;

export const InstanceInputSchema = z.object({
  openClawJson: OpenClawJsonSchema,
  env: EnvSchema,
  workspaceFiles: WorkspaceFilesSchema,
  skills: SkillsSchema,
  plugins: PluginsSchema,
  storage: StorageSchema,
});

export type InstanceInput = z.infer<typeof InstanceInputSchema>;

export const InstanceSchema = InstanceInputSchema.extend({
  name: z.string().min(1),
});

export type Instance = z.infer<typeof InstanceSchema>;
