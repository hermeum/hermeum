import { Template } from "@kubeclaw/entities";

export type Config = {
  templates: Template[];
};

export interface ConfigAdaptor {
  get(): Config;
}
