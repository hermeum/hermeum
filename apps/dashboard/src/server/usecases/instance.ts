import Handlebars from "handlebars";

import {
  Context,
  Instance,
  InstanceInput,
  InstanceInputSchema,
  JsonPatchOp,
  Skill,
  SkillSchema,
  EnvVar,
  WebhookVariables,
} from "@/entities";

import { KubernetesClient } from "../infras/kubernetes/client";
import { LocalConfig } from "../infras/local-agent-config";
import { PatchOpenClawInstanceInput, Runtime } from "./adaptors/runtime";
import { ConfigAdaptor } from "./adaptors/config";
import { SharedUseCase } from "./shared";

export class InstanceUseCase extends SharedUseCase {
  constructor(
    private readonly runtime: Runtime = new KubernetesClient(),
    config: ConfigAdaptor = new LocalConfig()
  ) {
    super(config);
  }

  getmutatingWebhookJsonPatch(instance: Instance): JsonPatchOp[] | null {
    if (!instance.agentType) return null;
    const { agentTypes } = this.config.get();
    const agentType = agentTypes?.[instance.agentType];
    if (!agentType) return null;
    return this.substituteVariables(agentType.mutatingWebhookJsonPatch, instance);
  }

  private substituteVariables(patch: JsonPatchOp[], instance: Instance): JsonPatchOp[] {
    const vars: WebhookVariables = {
      agentId: instance.id,
      userId: instance.userId,
      agentName: instance.agentName ?? "",
      agentDescription: instance.agentDescription ?? "",
      agentType: instance.agentType ?? "",
    };

    const substituteValue = (v: unknown): unknown => {
      const json = JSON.stringify(v);
      const substituted = Handlebars.compile(json, { noEscape: true })(vars);
      return JSON.parse(substituted);
    };

    return patch.map((op) => ({
      ...op,
      ...(op.value !== undefined && { value: substituteValue(op.value) }),
    }));
  }

  async listOpenClawInstances(ctx: Context): Promise<Instance[]> {
    return this.runtime.listOpenClawInstances();
  }

  async getOpenClawInstance(ctx: Context, id: string): Promise<Instance | null> {
    return this.runtime.getOpenClawInstance(id);
  }

  async createOpenClawInstance(ctx: Context, instanceInput: InstanceInput): Promise<Instance> {
    instanceInput = InstanceInputSchema.parse(instanceInput);

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
    if (instanceInput.agentType !== undefined) {
      this.checkAgentTypeAllowed(instanceInput.agentType);
    }
    await this.checkSecretsExist(instanceInput.secrets);
    return this.runtime.createOpenClawInstance({ ...instanceInput, userId: ctx.user!.id });
  }

  async updateOpenClawInstance(ctx: Context, id: string, patch: InstanceInput): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(id);
    if (!instance) {
      throw new Error(`OpenClawInstance ${id} not found`);
    }
    this.verifyOwnership(ctx, instance);

    patch = InstanceInputSchema.parse(patch);

    if (patch.openClawJson) {
      this.checkOpenClawJsonAllowed(instance.openClawJson ?? {}, patch.openClawJson);
    }
    for (const filePath of Object.keys(patch.workspaceFiles ?? {})) {
      this.checkWorkspaceFileAllowed(filePath);
    }
    for (const skill of patch.skills ?? []) {
      this.checkSkillAllowed(skill);
    }
    for (const plugin of patch.plugins ?? []) {
      this.checkPluginAllowed(plugin);
    }
    if (patch.agentType !== undefined) {
      this.checkAgentTypeAllowed(patch.agentType);
    }
    await this.checkSecretsExist(patch.secrets);
    return this.runtime.patchOpenClawInstance({ id, patch });
  }

  async deleteOpenClawInstance(ctx: Context, id: string): Promise<void> {
    const instance = await this.runtime.getOpenClawInstance(id);
    if (!instance) {
      throw new Error(`OpenClawInstance ${id} not found`);
    }
    this.verifyOwnership(ctx, instance);
    return this.runtime.deleteOpenClawInstance(id);
  }

  async addEnv(ctx: Context, instanceId: string, envVar: EnvVar): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceId} not found`);
    }
    this.verifyOwnership(ctx, instance);
    const alreadyExists = instance.envVars?.some((e) => e.name === envVar.name);
    if (alreadyExists) {
      throw new Error(`Env var "${envVar.name}" already exists`);
    }
    return this.runtime.patchOpenClawInstance({
      id: instanceId,
      patch: { envVars: [...(instance.envVars ?? []), envVar] },
    });
  }

  async updateEnv(ctx: Context, instanceId: string, envVar: EnvVar): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceId} not found`);
    }
    this.verifyOwnership(ctx, instance);
    const envVarExists = instance.envVars?.some((e) => e.name === envVar.name);
    if (!envVarExists) {
      throw new Error(`Env var "${envVar.name}" not found`);
    }
    return this.runtime.patchOpenClawInstance({
      id: instanceId,
      patch: { envVars: instance.envVars?.map((e) => (e.name === envVar.name ? envVar : e)) },
    });
  }

  async removeEnv(ctx: Context, instanceId: string, envName: string): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceId} not found`);
    }
    this.verifyOwnership(ctx, instance);
    const envVarExists = instance.envVars?.some((e) => e.name === envName);
    if (!envVarExists) {
      throw new Error(`Env var "${envName}" not found`);
    }
    return this.runtime.patchOpenClawInstance({
      id: instanceId,
      patch: { envVars: instance.envVars?.filter((e) => e.name !== envName) },
    });
  }

  async installSkill(ctx: Context, instanceId: string, skill: Skill): Promise<Instance> {
    SkillSchema.parse(skill);
    this.checkSkillAllowed(skill);

    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance "${instanceId}" not found`);
    }
    this.verifyOwnership(ctx, instance);
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

  async uninstallSkill(ctx: Context, instanceId: string, skill: Skill): Promise<Instance> {
    this.checkSkillAllowed(skill);
    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance "${instanceId}" not found`);
    }
    this.verifyOwnership(ctx, instance);
    const current = instance.skills ?? [];
    if (!current.includes(skill)) {
      throw new Error(`Skill "${skill}" is not installed on instance "${instanceId}"`);
    }
    return this.runtime.patchOpenClawInstance({
      id: instanceId,
      patch: { skills: current.filter((s) => s !== skill) },
    });
  }

  private async checkSecretsExist(secrets: string[] | undefined): Promise<void> {
    for (const name of secrets ?? []) {
      const secret = await this.runtime.getSecret(name);
      if (!secret) {
        throw new Error(`Secret "${name}" not found`);
      }
      if (secret.archived) {
        throw new Error(`Secret "${name}" is archived`);
      }
    }
  }

  async suspendOpenClawInstance(ctx: Context, id: string): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(id);
    if (!instance) {
      throw new Error(`OpenClawInstance ${id} not found`);
    }
    this.verifyOwnership(ctx, instance);
    return this.runtime.patchOpenClawInstance({ id, patch: { suspended: true } });
  }

  async resumeOpenClawInstance(ctx: Context, id: string): Promise<Instance> {
    const instance = await this.runtime.getOpenClawInstance(id);
    if (!instance) {
      throw new Error(`OpenClawInstance ${id} not found`);
    }
    this.verifyOwnership(ctx, instance);
    return this.runtime.patchOpenClawInstance({ id, patch: { suspended: false } });
  }

  async getGatewayToken(ctx: Context, instanceId: string): Promise<string | null> {
    const instance = await this.runtime.getOpenClawInstance(instanceId);
    if (!instance) {
      throw new Error(`OpenClawInstance ${instanceId} not found`);
    }
    this.verifyOwnership(ctx, instance);
    return this.runtime.getGatewayToken(instanceId);
  }

  private verifyOwnership(ctx: Context, resource: { userId: string }): void {
    if (ctx.user!.id !== resource.userId) {
      throw new Error("You don't have permission to perform this action");
    }
  }
}
