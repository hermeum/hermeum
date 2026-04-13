import type { Instance } from "@/entities/instance";
import type { API } from "./adaptors/api";

export class InstanceUseCase {
  constructor(private readonly api: API) {}

  list(): Promise<Instance[]> {
    return this.api.listInstances();
  }

  get(name: string): Promise<Instance | null> {
    return this.api.getInstance(name);
  }

  create(templateName: string): Promise<Instance> {
    return this.api.createInstance(templateName);
  }

  delete(name: string): Promise<void> {
    return this.api.deleteInstance(name);
  }
}
