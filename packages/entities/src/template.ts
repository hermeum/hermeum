import { z } from "zod";

import {
  InitialFilesSchema,
  SkillsSchema,
  PluginsSchema,
  StorageSchema,
  SelfConfigureSchema,
  ConfigSchema,
} from "./instance";

export const TemplateLockedSchema = z.object({
  selfConfigure: SelfConfigureSchema,
  config: ConfigSchema,
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
  name: z.string(),
  locked: TemplateLockedSchema,
  defaults: TemplateDefaultsSchema,
});

export type Template = z.infer<typeof TemplateSchema>;
