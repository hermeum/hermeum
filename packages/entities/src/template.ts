import { z } from "zod";

import {
  InitialFilesSchema,
  SkillsSchema,
  PluginsSchema,
  StorageSchema,
  SelfConfigureSchema,
  ConfigSchema,
} from "./instance";

export const TemplateSchema = z.object({
  name: z.string(),
  selfConfigure: SelfConfigureSchema,
  config: ConfigSchema,
  initialFiles: InitialFilesSchema,
  skills: SkillsSchema,
  plugins: PluginsSchema,
  storage: StorageSchema,
});

export type Template = z.infer<typeof TemplateSchema>;
