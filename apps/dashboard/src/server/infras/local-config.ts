import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

import { TemplateSchema, InitConfig, InitConfigSchema } from "@/entities";
import { ConfigAdaptor } from "../usecases/adaptors/config";

export class LocalConfig implements ConfigAdaptor {
  private cache: InitConfig;

  constructor(private filePath?: string) {
    const resolvedPath =
      this.filePath ?? process.env.CONFIG_PATH ?? path.resolve(process.cwd(), "kubeclaw.yaml");

    const content = fs.readFileSync(resolvedPath, "utf-8");
    const raw = parse(content);

    this.cache = InitConfigSchema.parse(raw);
  }

  get(): InitConfig {
    return this.cache;
  }
}
