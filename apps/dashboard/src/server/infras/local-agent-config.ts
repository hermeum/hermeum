import * as fs from "node:fs";
import { parse } from "yaml";

import { AgentConfig, AgentConfigSchema } from "@/entities";
import { config } from "@/server/libs/config";
import { ConfigAdaptor } from "../usecases/adaptors/config";

export class LocalConfig implements ConfigAdaptor {
  private cache: AgentConfig;

  constructor(private filePath?: string) {
    const resolvedPath = this.filePath ?? config.agentConfigPath;

    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      const raw = parse(content);
      this.cache = AgentConfigSchema.parse(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache = AgentConfigSchema.parse({ templates: [] });
      } else {
        throw err;
      }
    }
  }

  get(): AgentConfig {
    return this.cache;
  }
}
