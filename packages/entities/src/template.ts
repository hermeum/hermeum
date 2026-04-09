import { z } from "zod";

import {
  WorkspaceSchema,
  SkillsSchema,
  PluginsSchema,
  StorageSchema,
  ConfigSchema,
} from "./instance";

export const TemplateSchema = z.object({
  name: z.string(),
  config: ConfigSchema,
  workspace: WorkspaceSchema,
  skills: SkillsSchema,
  plugins: PluginsSchema,
  storage: StorageSchema,
});

export type Template = z.infer<typeof TemplateSchema>;
