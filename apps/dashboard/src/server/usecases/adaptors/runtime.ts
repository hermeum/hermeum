import { CreateSandboxInput, RunCommandInput, Sandbox } from "@kubebox/entities";

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
}
