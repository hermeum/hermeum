import type { Instance } from "@/entities/instance";
import type { Template } from "@/entities/template";

export interface API {
  listInstances(): Promise<Instance[]>;
  getInstance(name: string): Promise<Instance | null>;
  createInstance(templateId: string): Promise<Instance>;
  deleteInstance(name: string): Promise<void>;
  listTemplates(): Promise<Template[]>;
}
