import * as fs from "node:fs";
import { parse } from "yaml";

import { HermeumConfig, HermeumConfigSchema } from "@/entities";
import { config } from "@/server/libs/config";
import { ConfigAdaptor } from "../usecases/adaptors/config";

export class LocalConfig implements ConfigAdaptor {
  private cache: HermeumConfig;

  constructor(private filePath?: string) {
    const resolvedPath = this.filePath ?? config.agentConfigPath;

    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      const raw = parse(content);
      this.cache = HermeumConfigSchema.parse(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache = HermeumConfigSchema.parse({ templates: [] });
      } else {
        throw err;
      }
    }
  }

  get(): HermeumConfig {
    return this.cache;
  }
}
