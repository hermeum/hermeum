import { parse } from "yaml";

import { HermeumConfig, HermeumConfigSchema } from "@/entities";
import { config } from "@/server/libs/config";

import { LocalFiles } from "../infras/local-files";
import { FileAdaptor } from "./adaptors/file";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = object> = new (...args: any[]) => T;

// Mixin adding Hermeum config loading to a use case class. The validated
// config is cached once per instance (routers hold singleton use cases, so
// effectively once per process). Compose with:
//   class MyUseCase extends HermeumConfigLoadable(class {}) { ... }
export function HermeumConfigLoadable<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    protected hermeumConfigFiles: FileAdaptor = new LocalFiles();
    protected hermeumConfigPath: string = config.agentConfigPath;
    #cachedHermeumConfig?: HermeumConfig;

    async loadHermeumConfig(): Promise<HermeumConfig> {
      if (!this.#cachedHermeumConfig) {
        const file = await this.hermeumConfigFiles.readFile(this.hermeumConfigPath);
        const raw = file === null ? { templates: [] } : parse(file.content);
        this.#cachedHermeumConfig = HermeumConfigSchema.parse(raw);
      }
      return this.#cachedHermeumConfig;
    }
  };
}
