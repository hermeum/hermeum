import { z } from "zod";

import {
  WorkspaceFilesSchema,
  SkillsSchema,
  PluginsSchema,
  StorageSchema,
  OpenClawJsonSchema,
} from "./instance";

export const TemplateSchema = z.object({
  name: z.string(),
  openClawJson: OpenClawJsonSchema,
  workspaceFiles: WorkspaceFilesSchema,
  skills: SkillsSchema,
  plugins: PluginsSchema,
  storage: StorageSchema,
});

export type Template = z.infer<typeof TemplateSchema>;
