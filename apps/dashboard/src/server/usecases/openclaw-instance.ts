import { EnvVar, Instance } from "@kubeclaw/entities";

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

  async addEnv(instanceName: string, envVar: EnvVar): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(instanceName);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceName} not found`);
    }
    const alreadyExists = instance.env?.some((e) => e.name === envVar.name);
    if (alreadyExists) {
      throw new Error(`Env var "${envVar.name}" already exists`);
    }
    return this.runtime.patchOpenClawInstance({
      name: instanceName,
      patch: { env: [...(instance.env ?? []), envVar] },
    });
  }

  async updateEnv(instanceName: string, envVar: EnvVar): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(instanceName);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceName} not found`);
    }
    const envVarExists = instance.env?.some((e) => e.name === envVar.name);
    if (!envVarExists) {
      throw new Error(`Env var "${envVar.name}" not found`);
    }
    return this.runtime.patchOpenClawInstance({
      name: instanceName,
      patch: { env: instance.env.map((e) => (e.name === envVar.name ? envVar : e)) },
    });
  }

  async removeEnv(instanceName: string, envName: string): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(instanceName);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceName} not found`);
    }
    const envVarExists = instance.env?.some((e) => e.name === envName);
    if (!envVarExists) {
      throw new Error(`Env var "${envName}" not found`);
    }
    return this.runtime.patchOpenClawInstance({
      name: instanceName,
      patch: { env: instance.env.filter((e) => e.name !== envName) },
    });
  }

  async deleteOpenClawInstance(name: string): Promise<void> {
    const instance = await this.runtime.getOpenClawInstance(name);
    if (!instance) {
      throw new Error(`OpenClawInstance ${name} not found`);
    }
    return this.runtime.deleteOpenClawInstance(name);
  }
}
