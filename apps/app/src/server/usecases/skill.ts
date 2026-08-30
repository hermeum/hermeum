import { SkillSummary } from "@/entities";
import { BaseUseCase } from "./mixin";

export class SkillUseCase extends BaseUseCase {
  // Empty query returns the featured/full list from the index (trust-filtered
  // and cached by the adaptor).
  async list(limit?: number): Promise<SkillSummary[]> {
    return this.skillIndex.searchSkills("", limit);
  }
}