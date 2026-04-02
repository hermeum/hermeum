import { CreateSandboxInput, Sandbox } from "@kubeclaw/entities";
import { Runtime } from "./adaptors/runtime";
import { KubernetesClient } from "../infras/kubernetes/client";

export class SandboxUseCase {
  constructor(private readonly runtime: Runtime = new KubernetesClient("default")) {}

  async listSandboxes(): Promise<Sandbox[]> {
    return this.runtime.listSandboxes();
  }

  async getSandbox(name: string): Promise<Sandbox | null> {
    return this.runtime.getSandbox(name);
  }

  async createSandbox(input: CreateSandboxInput): Promise<Sandbox> {
    return await this.runtime.createSandbox(input);
  }

  async deleteSandbox(name: string): Promise<void> {
    const sandbox = await this.runtime.getSandbox(name);
    if (!sandbox) {
      throw new Error(`Sandbox ${name} not found`);
    }

    return this.runtime.deleteSandbox(sandbox);
  }
}
