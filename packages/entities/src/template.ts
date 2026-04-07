import { z } from "zod";

import { InitialFilesSchema, SkillsSchema, PluginsSchema, StorageSchema } from "./instance";

export const TemplateLockedSchema = z.object({
  initialFiles: InitialFilesSchema,
  skills: SkillsSchema,
  plugins: PluginsSchema,
});

export type TemplateLocked = z.infer<typeof TemplateLockedSchema>;

export const TemplateDefaultsSchema = z.object({
  storage: StorageSchema,
});

export type TemplateDefaults = z.infer<typeof TemplateDefaultsSchema>;

export const TemplateSchema = z.object({
  locked: TemplateLockedSchema,
  defaults: TemplateDefaultsSchema,
});

export type Template = z.infer<typeof TemplateSchema>;
