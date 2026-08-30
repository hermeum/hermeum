import { SkillSummary } from "@/entities";
import { BaseUseCase } from "./mixin";

export class SkillUseCase extends BaseUseCase {
  // Keyword search over the curated index. An empty query returns the
  // featured/full list (trust-filtered and cached by the adaptor).
  async search(query: string, limit?: number): Promise<SkillSummary[]> {
    return this.skillIndex.searchSkills(query, limit);
  }
}