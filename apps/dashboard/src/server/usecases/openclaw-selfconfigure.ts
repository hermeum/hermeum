import { OpenClawJson } from "@kubeclaw/entities";

import { LocalConfig } from "../infras/local-config";
import { ConfigAdaptor } from "./adaptors/config";
import { SharedUseCase } from "./shared";

export class SelfConfigureUseCase extends SharedUseCase {
  constructor(config: ConfigAdaptor = new LocalConfig()) {
    super(config);
  }

  async patchConfig(originalConfig: OpenClawJson, inputConfig: OpenClawJson): Promise<void> {
    this.checkConfigPatchAllowed(originalConfig, inputConfig);
  }
}
