import { Instance, InstanceInput } from "@/entities";

export type CreateOpenClawInstanceInput = { id: string; instanceInput: InstanceInput };
export type PatchOpenClawInstanceInput = { id: string; patch: Partial<Omit<Instance, "id" | "phase" | "createdAt">> };

export interface Runtime {
  listOpenClawInstances: () => Promise<Instance[]>;
  getOpenClawInstance: (id: string) => Promise<Instance | null>;
  createOpenClawInstance: (input: CreateOpenClawInstanceInput) => Promise<Instance>;
  patchOpenClawInstance: (input: PatchOpenClawInstanceInput) => Promise<Instance>;
  deleteOpenClawInstance: (id: string) => Promise<void>;
}
