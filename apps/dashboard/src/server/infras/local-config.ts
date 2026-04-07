import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

import { TemplateSchema } from "@kubeclaw/entities";
import { Config, ConfigAdaptor } from "../usecases/adaptors/config";

const ConfigSchema = z.object({
  templates: z.array(TemplateSchema),
});

export class LocalConfig implements ConfigAdaptor {
  private cache: Config;

  constructor(private filePath?: string) {
    const resolvedPath =
      this.filePath ?? process.env.CONFIG_PATH ?? path.resolve(process.cwd(), "kubeclaw.yaml");

    const content = fs.readFileSync(resolvedPath, "utf-8");
    const raw = parse(content);

    this.cache = ConfigSchema.parse(raw);
  }

  get(): Config {
    return this.cache;
  }
}
