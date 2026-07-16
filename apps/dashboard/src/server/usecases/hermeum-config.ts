import { parse } from "yaml";

import { HermeumConfig, HermeumConfigSchema } from "@/entities";
import { config } from "@/server/libs/config";

import { LocalFiles } from "../infras/local-files";
import { FileAdaptor } from "./adaptors/file";

// Loads and validates the Hermeum config file once per loader instance
// (routers hold singleton use cases, so effectively once per process).
export class HermeumConfigLoader {
  private cached?: HermeumConfig;

  constructor(
    private readonly files: FileAdaptor = new LocalFiles(),
    private readonly path: string = config.agentConfigPath
  ) {}

  async load(): Promise<HermeumConfig> {
    if (!this.cached) {
      const file = await this.files.readFile(this.path);
      const raw = file === null ? { templates: [] } : parse(file.content);
      this.cached = HermeumConfigSchema.parse(raw);
    }
    return this.cached;
  }
}
