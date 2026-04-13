import type { Template } from "@/entities/template";
import type { API } from "./adaptors/api";

export class TemplateUseCase {
  constructor(private readonly api: API) {}

  async list(): Promise<Template[]> {
    return await this.api.listTemplates();
  }
}
