import { Instance, Skill, SkillSchema, EnvVar, Config } from "@kubeclaw/entities";
import jsonPatch from "fast-json-patch";

import { KubernetesClient } from "../infras/kubernetes/client";
import { LocalConfig } from "../infras/local-config";
import { PatchOpenClawInstanceInput, Runtime } from "./adaptors/runtime";
import { ConfigAdaptor } from "./adaptors/config";

const { compare } = jsonPatch;

function deepMerge(
  dst: Record<string, unknown>,
  src: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...dst };
  for (const key of Object.keys(src)) {
    const srcVal = src[key];
    const dstVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      dstVal !== null &&
      typeof dstVal === "object" &&
      !Array.isArray(dstVal)
    ) {
      result[key] = deepMerge(dstVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

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

  private checkConfigPatchAllowed(originalConfig: Config, inputConfig: Config): void {
    const { allowedConfigPaths: allowedPaths } = this.config.get();
    if (allowedPaths === undefined) {
      return;
    }

    const original = (originalConfig ?? {}) as Record<string, unknown>;
    const input = (inputConfig ?? {}) as Record<string, unknown>;
    const merged = deepMerge(original, input);
    const ops = compare(original, merged);

    for (const op of ops) {
      const isAllowed = allowedPaths.some(
        (allowed) => op.path === allowed || op.path.startsWith(allowed + "/")
      );
      if (!isAllowed) {
        throw new Error(
          `Config patch is not allowed: path "${op.path}" is not in the allowed list`
        );
      }
    }
  }

  private checkWorkspaceFileAllowed(filePath: string): void {
    const { allowedWorkspaceFiles } = this.config.get();
    if (allowedWorkspaceFiles === undefined) {
      return;
    }
    if (!allowedWorkspaceFiles.includes(filePath)) {
      throw new Error(
        `Workspace file operation is not allowed: "${filePath}" is not in the allowed list`
      );
    }
  }

  async patchOpenClawInstance(input: PatchOpenClawInstanceInput): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(input.name);
    if (!instance) {
      throw new Error(`OpenClawInstance ${input.name} not found`);
    }
    if (input.patch.config !== undefined) {
      this.checkConfigPatchAllowed(instance.config, input.patch.config);
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
      patch: { env: instance.env?.map((e) => (e.name === envVar.name ? envVar : e)) },
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
      patch: { env: instance.env?.filter((e) => e.name !== envName) },
    });
  }

  async deleteOpenClawInstance(name: string): Promise<void> {
    const instance = await this.runtime.getOpenClawInstance(name);
    if (!instance) {
      throw new Error(`OpenClawInstance ${name} not found`);
    }
    return this.runtime.deleteOpenClawInstance(name);
  }

  private checkSkillAllowed(skill: Skill): void {
    const { allowedSkills } = this.config.get();
    if (allowedSkills === undefined) {
      return;
    }
    const isAllowed = allowedSkills.some((pattern) => new RegExp(pattern).test(skill));
    if (!isAllowed) {
      throw new Error(`Skill "${skill}" is not in the allowed list`);
    }
  }

  async installSkill(instanceName: string, skill: Skill): Promise<Instance> {
    SkillSchema.parse(skill);
    this.checkSkillAllowed(skill);

    const instance = await this.runtime.getOpenClawInstance(instanceName);
    if (!instance) {
      throw new Error(`OpenClawInstance "${instanceName}" not found`);
    }
    const current = instance.skills ?? [];
    if (current.includes(skill)) {
      throw new Error(`Skill "${skill}" is already installed on instance "${instanceName}"`);
    }
    if (current.length >= 20) {
      throw new Error("Instance already has the maximum of 20 skills");
    }
    return this.runtime.patchOpenClawInstance({
      name: instanceName,
      patch: { skills: [...current, skill] },
    });
  }

  async uninstallSkill(instanceName: string, skill: Skill): Promise<Instance> {
    this.checkSkillAllowed(skill);
    const instance = await this.runtime.getOpenClawInstance(instanceName);
    if (!instance) {
      throw new Error(`OpenClawInstance "${instanceName}" not found`);
    }
    const current = instance.skills ?? [];
    if (!current.includes(skill)) {
      throw new Error(`Skill "${skill}" is not installed on instance "${instanceName}"`);
    }
    return this.runtime.patchOpenClawInstance({
      name: instanceName,
      patch: { skills: current.filter((s) => s !== skill) },
    });
  }
}
