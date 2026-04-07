import { CreateSandboxInput, Instance, RunCommandInput, Sandbox, Template } from "@kubeclaw/entities";

export type CreateOpenClawInstanceInput = { name: string; template: Template };
export type PatchOpenClawInstanceInput = { name: string; patch: Partial<Omit<Instance, "name">> };

export interface Runtime {
  listSandboxes: () => Promise<Sandbox[]>;
  getSandbox: (name: string) => Promise<Sandbox | null>;
  createSandbox: (input: CreateSandboxInput) => Promise<Sandbox>;
  deleteSandbox: (sandbox: Sandbox) => Promise<void>;
  runCommand: (
    input: RunCommandInput,
    onStdout: (chunk: string) => void,
    onStderr: (chunk: string) => void,
    onExit: (exitCode: number) => void
  ) => Promise<void>;
  listOpenClawInstances: () => Promise<Instance[]>;
  getOpenClawInstance: (name: string) => Promise<Instance | null>;
  createOpenClawInstanceByTemplate: (input: CreateOpenClawInstanceInput) => Promise<Instance>;
  patchOpenClawInstance: (input: PatchOpenClawInstanceInput) => Promise<Instance>;
  deleteOpenClawInstance: (name: string) => Promise<void>;
}
