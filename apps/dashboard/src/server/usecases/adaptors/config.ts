import { AgentConfig } from "@/entities";

export interface ConfigAdaptor {
  get(): AgentConfig;
}
