import type { Template } from "@/entities/template";
import type { API } from "./adaptors/api";

export class TemplateUseCase {
  constructor(private readonly api: API) {}

  list(): Promise<Template[]> {
    return this.api.listTemplates();
  }
}
