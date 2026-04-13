import type { Instance } from "@/entities/instance";
import type { API } from "./adaptors/api";

export class InstanceUseCase {
  constructor(private readonly api: API) {}

  async list(): Promise<Instance[]> {
    return await this.api.listInstances();
  }

  async get(name: string): Promise<Instance | null> {
    return await this.api.getInstance(name);
  }

  async create(templateName: string): Promise<Instance> {
    return await this.api.createInstance(templateName);
  }

  async delete(name: string): Promise<void> {
    return await this.api.deleteInstance(name);
  }
}
