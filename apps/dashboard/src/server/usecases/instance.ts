import { Instance, InstanceInput, Skill, SkillSchema, EnvVar } from "@/entities";

import { KubernetesClient } from "../infras/kubernetes/client";
import { LocalConfig } from "../infras/local-config";
import { PatchOpenClawInstanceInput, Runtime } from "./adaptors/runtime";
import { ConfigAdaptor } from "./adaptors/config";
import { SharedUseCase } from "./shared";

export class InstanceUseCase extends SharedUseCase {
  constructor(
    private readonly runtime: Runtime = new KubernetesClient("kubeclaw"),
    config: ConfigAdaptor = new LocalConfig()
  ) {
    super(config);
  }

  async listOpenClawInstances(): Promise<Instance[]> {
    return this.runtime.listOpenClawInstances();
  }

  async getOpenClawInstance(id: string): Promise<Instance | null> {
    return this.runtime.getOpenClawInstance(id);
  }

  async createOpenClawInstance(instanceInput: InstanceInput): Promise<Instance> {
    if (instanceInput.openClawJson) {
      this.checkOpenClawJsonAllowed({}, instanceInput.openClawJson);
    }
    for (const filePath of Object.keys(instanceInput.workspaceFiles ?? {})) {
      this.checkWorkspaceFileAllowed(filePath);
    }
    for (const skill of instanceInput.skills ?? []) {
      this.checkSkillAllowed(skill);
    }
    for (const plugin of instanceInput.plugins ?? []) {
      this.checkPluginAllowed(plugin);
    }
    const id = `kubeclaw-${Math.random().toString(36).slice(2, 8)}`;
    return this.runtime.createOpenClawInstance({ id, instanceInput });
  }

  async updateOpenClawInstance(id: string, patch: InstanceInput): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(id);
    if (!instance) {
      throw new Error(`OpenClawInstance ${id} not found`);
    }
    return this.runtime.patchOpenClawInstance({ id, patch });
  }

  async deleteOpenClawInstance(id: string): Promise<void> {
    const instance = await this.runtime.getOpenClawInstance(id);
    if (!instance) {
      throw new Error(`OpenClawInstance ${id} not found`);
    }
    return this.runtime.deleteOpenClawInstance(id);
  }

  async addEnv(instanceId: string, envVar: EnvVar): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceId} not found`);
    }
    const alreadyExists = instance.env?.some((e) => e.name === envVar.name);
    if (alreadyExists) {
      throw new Error(`Env var "${envVar.name}" already exists`);
    }
    return this.runtime.patchOpenClawInstance({
      id: instanceId,
      patch: { env: [...(instance.env ?? []), envVar] },
    });
  }

  async updateEnv(instanceId: string, envVar: EnvVar): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceId} not found`);
    }
    const envVarExists = instance.env?.some((e) => e.name === envVar.name);
    if (!envVarExists) {
      throw new Error(`Env var "${envVar.name}" not found`);
    }
    return this.runtime.patchOpenClawInstance({
      id: instanceId,
      patch: { env: instance.env?.map((e) => (e.name === envVar.name ? envVar : e)) },
    });
  }

  async removeEnv(instanceId: string, envName: string): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceId} not found`);
    }
    const envVarExists = instance.env?.some((e) => e.name === envName);
    if (!envVarExists) {
      throw new Error(`Env var "${envName}" not found`);
    }
    return this.runtime.patchOpenClawInstance({
      id: instanceId,
      patch: { env: instance.env?.filter((e) => e.name !== envName) },
    });
  }

  async installSkill(instanceId: string, skill: Skill): Promise<Instance> {
    SkillSchema.parse(skill);
    this.checkSkillAllowed(skill);

    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance "${instanceId}" not found`);
    }
    const current = instance.skills ?? [];
    if (current.includes(skill)) {
      throw new Error(`Skill "${skill}" is already installed on instance "${instanceId}"`);
    }
    if (current.length >= 20) {
      throw new Error("Instance already has the maximum of 20 skills");
    }
    return this.runtime.patchOpenClawInstance({
      id: instanceId,
      patch: { skills: [...current, skill] },
    });
  }

  async uninstallSkill(instanceId: string, skill: Skill): Promise<Instance> {
    this.checkSkillAllowed(skill);
    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance "${instanceId}" not found`);
    }
    const current = instance.skills ?? [];
    if (!current.includes(skill)) {
      throw new Error(`Skill "${skill}" is not installed on instance "${instanceId}"`);
    }
    return this.runtime.patchOpenClawInstance({
      id: instanceId,
      patch: { skills: current.filter((s) => s !== skill) },
    });
  }
}
