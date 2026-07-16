import { Context, Template } from "@/entities";
import { FilesUseCase, HermeumConfigLoadable } from "./mixin";

export class TemplateUseCase extends HermeumConfigLoadable(FilesUseCase) {
  async list(_ctx: Context): Promise<Template[]> {
    return (await this.loadHermeumConfig()).templates;
  }

  async get(ctx: Context, id: string): Promise<Template | null> {
    const { templates } = await this.loadHermeumConfig();
    return templates.find((t) => t.id === id) ?? null;
  }
}
