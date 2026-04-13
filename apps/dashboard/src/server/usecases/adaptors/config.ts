import { InitConfig } from "@/entities";

export interface ConfigAdaptor {
  get(): InitConfig;
}
