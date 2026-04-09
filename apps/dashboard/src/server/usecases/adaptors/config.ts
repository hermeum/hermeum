import { InitConfig } from "@kubeclaw/entities";

export interface ConfigAdaptor {
  get(): InitConfig;
}
