import { Template } from "@kubeclaw/entities";

export class TemplateUseCase {
  constructor(private readonly templates: Template[]) {}

  list(): Template[] {
    return this.templates;
  }

  get(name: string): Template | null {
    return this.templates.find((t) => t.name === name) ?? null;
  }
}
