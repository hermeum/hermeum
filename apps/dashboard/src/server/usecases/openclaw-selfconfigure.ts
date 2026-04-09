import { Config } from "@kubeclaw/entities";

import { LocalConfig } from "../infras/local-config";
import { ConfigAdaptor } from "./adaptors/config";
import { SharedUseCase } from "./shared";

export class SelfConfigureUseCase extends SharedUseCase {
  constructor(config: ConfigAdaptor = new LocalConfig()) {
    super(config);
  }

  async patchConfig(originalConfig: Config, inputConfig: Config): Promise<void> {
    this.checkConfigPatchAllowed(originalConfig, inputConfig);
  }
}
