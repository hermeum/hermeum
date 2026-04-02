import { Command, RunCommandInput } from "@kubeclaw/entities";

import { KubernetesClient } from "../infras/kubernetes/client";
import { Runtime } from "./adaptors/runtime";

export class CommandUseCase {
  private readonly commands = new Map<string, Command>();

  constructor(private readonly runtime: Runtime = new KubernetesClient("default")) {}

  async runCommand(input: RunCommandInput): Promise<Command> {
    const sandbox = await this.runtime.getSandbox(input.sandboxName);
    if (!sandbox) {
      throw new Error(`Sandbox ${input.sandboxName} not found`);
    } else if (sandbox.status !== "success" || sandbox.paused) {
      throw new Error(`Sandbox ${input.sandboxName} is not running`);
    }

    const id = crypto.randomUUID();
    let stdout = "";
    let stderr = "";
    let exitCode = 1;

    await this.runtime.runCommand(
      input,
      (chunk) => {
        stdout += chunk;
      },
      (chunk) => {
        stderr += chunk;
      },
      (code) => {
        exitCode = code;
      }
    );

    const cmd: Command = {
      id,
      ...input,
      stdout,
      stderr,
      exitCode,
    };
    this.commands.set(id, cmd);
    return cmd;
  }

  async getCommand(id: string): Promise<Command | null> {
    return this.commands.get(id) ?? null;
  }
}
