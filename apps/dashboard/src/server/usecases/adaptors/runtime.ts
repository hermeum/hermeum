import { Instance, Template } from "@kubeclaw/entities";

export type CreateOpenClawInstanceInput = { name: string; template: Template };
export type PatchOpenClawInstanceInput = { name: string; patch: Partial<Omit<Instance, "name">> };

export interface Runtime {
  listOpenClawInstances: () => Promise<Instance[]>;
  getOpenClawInstance: (name: string) => Promise<Instance | null>;
  createOpenClawInstanceByTemplate: (input: CreateOpenClawInstanceInput) => Promise<Instance>;
  patchOpenClawInstance: (input: PatchOpenClawInstanceInput) => Promise<Instance>;
  deleteOpenClawInstance: (name: string) => Promise<void>;
}
