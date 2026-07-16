import { parse } from "yaml";

import { HermeumConfig, HermeumConfigSchema } from "@/entities";
import { config } from "@/server/libs/config";

import { KubernetesClient } from "../infras/kubernetes/client";
import { LocalFiles } from "../infras/local-files";
import { FileAdaptor } from "./adaptors/file";
import { Runtime } from "./adaptors/runtime";

// Core base class for use cases backed by the file and runtime adaptors;
// mixins like HermeumConfigLoadable build on the injected adaptors.
export class BaseUseCase {
  constructor(
    readonly runtime: Runtime = new KubernetesClient(),
    readonly files: FileAdaptor = new LocalFiles()
  ) {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = object> = new (...args: any[]) => T;

// Mixin adding Hermeum config loading to a use case class whose base provides
// the file adaptor (e.g. BaseUseCase). The validated config is cached once
// per instance (routers hold singleton use cases, so effectively once per
// process). Compose with:
//   class MyUseCase extends HermeumConfigLoadable(BaseUseCase) { ... }
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