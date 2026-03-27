import { CreateSandboxInput, Sandbox } from "@kubebox/entities";

export interface Runtime {
  listSandboxes: () => Promise<Sandbox[]>;
  getSandbox: (name: string) => Promise<Sandbox | null>;
  createSandbox: (input: CreateSandboxInput) => Promise<Sandbox>;
  deleteSandbox: (sandbox: Sandbox) => Promise<void>;
}
