import { z } from "zod";

export const EnvFromSecretSchema = z.string().optional();

export type EnvFromSecret = z.infer<typeof EnvFromSecretSchema>;

export const InitialFilesSchema = z.record(z.string()).optional();

export type InitialFiles = z.infer<typeof InitialFilesSchema>;

export const SkillsSchema = z.array(z.string()).max(20).optional();

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

export const InstanceSchema = z.object({
  name: z.string().min(1),
  envFromSecret: EnvFromSecretSchema,
  initialFiles: InitialFilesSchema,
  skills: SkillsSchema,
  plugins: PluginsSchema,
  storage: StorageSchema,
});

export type Instance = z.infer<typeof InstanceSchema>;
