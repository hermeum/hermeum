import { Template } from "@/entities";
import { ConfigAdaptor } from "./adaptors/config";

export class TemplateUseCase {
  constructor(private readonly config: ConfigAdaptor) {}

  list(): Template[] {
    return this.config.get().templates;
  }

  get(id: string): Template | null {
    return this.config.get().templates.find((t) => t.id === id) ?? null;
  }
}
