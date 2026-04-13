import { Template } from "@/entities";
import { ConfigAdaptor } from "./adaptors/config";

export class TemplateUseCase {
  constructor(private readonly config: ConfigAdaptor) {}

  list(): Template[] {
    return Object.values(this.config.get().templates);
  }

  get(name: string): Template | null {
    return this.config.get().templates[name] ?? null;
  }
}
