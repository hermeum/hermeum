import { Instance } from "@kubeclaw/entities";

import { KubernetesClient } from "../infras/kubernetes/client";
import { LocalConfig } from "../infras/local-config";
import {
  CreateOpenClawInstanceInput,
  PatchOpenClawInstanceInput,
  Runtime,
} from "./adaptors/runtime";
import { ConfigAdaptor } from "./adaptors/config";

export class InstanceUseCase {
  constructor(
    private readonly runtime: Runtime = new KubernetesClient("kubeclaw"),
    private readonly config: ConfigAdaptor = new LocalConfig()
  ) {}

  async listOpenClawInstances(): Promise<Instance[]> {
    return this.runtime.listOpenClawInstances();
  }

  async getOpenClawInstance(name: string): Promise<Instance | null> {
    return this.runtime.getOpenClawInstance(name);
  }

  async createOpenClawInstanceByTemplate(templateName: string): Promise<Instance> {
    const template = this.config.get().templates.find((t) => t.name === templateName) ?? null;
    if (!template) {
      throw new Error(`Template "${templateName}" not found`);
    }

    const name = `kubeclaw-${Math.random().toString(36).slice(2, 8)}`;
    return this.runtime.createOpenClawInstanceByTemplate({ name, template });
  }

  async patchOpenClawInstance(input: PatchOpenClawInstanceInput): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(input.name);
    if (!instance) {
      throw new Error(`OpenClawInstance ${input.name} not found`);
    }
    return this.runtime.patchOpenClawInstance(input);
  }

  async deleteOpenClawInstance(name: string): Promise<void> {
    const instance = await this.runtime.getOpenClawInstance(name);
    if (!instance) {
      throw new Error(`OpenClawInstance ${name} not found`);
    }
    return this.runtime.deleteOpenClawInstance(name);
  }
}
