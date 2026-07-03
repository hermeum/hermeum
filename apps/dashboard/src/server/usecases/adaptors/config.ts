import { HermeumConfig } from "@/entities";

export interface ConfigAdaptor {
  get(): HermeumConfig;
}
