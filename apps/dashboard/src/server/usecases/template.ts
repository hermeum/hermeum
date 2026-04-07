import { Template } from "@kubeclaw/entities";
import { ConfigAdaptor } from "./adaptors/config";

export class TemplateUseCase {
  constructor(private readonly config: ConfigAdaptor) {}

  list(): Template[] {
    return this.config.get().templates;
  }

  get(name: string): Template | null {
    return this.config.get().templates.find((t) => t.name === name) ?? null;
  }
}
