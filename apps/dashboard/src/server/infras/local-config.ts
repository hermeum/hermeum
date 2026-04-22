import * as fs from "node:fs";
import { parse } from "yaml";

import { InitConfig, InitConfigSchema } from "@/entities";
import { config } from "@/server/config";
import { ConfigAdaptor } from "../usecases/adaptors/config";

export class LocalConfig implements ConfigAdaptor {
  private cache: InitConfig;

  constructor(private filePath?: string) {
    const resolvedPath = this.filePath ?? config.agentConfigPath;

    const content = fs.readFileSync(resolvedPath, "utf-8");
    const raw = parse(content);

    this.cache = InitConfigSchema.parse(raw);
  }

  get(): InitConfig {
    return this.cache;
  }
}
