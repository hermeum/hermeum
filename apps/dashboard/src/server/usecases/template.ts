import { Context, Template } from "@/entities";
import { HermeumConfigLoader } from "./hermeum-config";

export class TemplateUseCase {
  constructor(private readonly configLoader: HermeumConfigLoader) {}

  async list(_ctx: Context): Promise<Template[]> {
    return (await this.configLoader.load()).templates;
  }

  async get(ctx: Context, id: string): Promise<Template | null> {
    const { templates } = await this.configLoader.load();
    return templates.find((t) => t.id === id) ?? null;
  }
}
