import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

import { TemplateSchema } from "@kubeclaw/entities";

const ConfigSchema = z.object({
  templates: z.array(TemplateSchema).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(filePath?: string): Config {
  const resolvedPath =
    filePath ?? process.env.CONFIG_PATH ?? path.resolve(process.cwd(), "kubeclaw.yaml");

  if (!fs.existsSync(resolvedPath)) {
    return { templates: [] };
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const raw = parse(content);

  return ConfigSchema.parse(raw);
}
