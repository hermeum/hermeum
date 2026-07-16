import { parse } from "yaml";

import { HermeumConfig, HermeumConfigSchema } from "@/entities";
import { config } from "@/server/libs/config";

import { LocalFiles } from "../infras/local-files";
import { FileAdaptor } from "./adaptors/file";

// Core base class for use cases that read local files; mixins like
// HermeumConfigLoadable build on the injected adaptor.
export class FilesUseCase {
  constructor(readonly files: FileAdaptor = new LocalFiles()) {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = object> = new (...args: any[]) => T;

// Mixin adding Hermeum config loading to a use case class whose base provides
// the file adaptor (e.g. FilesUseCase). The validated config is cached once
// per instance (routers hold singleton use cases, so effectively once per
// process). Compose with:
//   class MyUseCase extends HermeumConfigLoadable(FilesUseCase) { ... }
export function HermeumConfigLoadable<TBase extends Constructor<{ files: FileAdaptor }>>(
  Base: TBase
) {
  return class extends Base {
    #cachedHermeumConfig?: HermeumConfig;

    async loadHermeumConfig(): Promise<HermeumConfig> {
      if (!this.#cachedHermeumConfig) {
        const file = await this.files.readFile(config.agentConfigPath);
        const raw = file === null ? { templates: [] } : parse(file.content);
        this.#cachedHermeumConfig = HermeumConfigSchema.parse(raw);
      }
      return this.#cachedHermeumConfig;
    }
  };
}