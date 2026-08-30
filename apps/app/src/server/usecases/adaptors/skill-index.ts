import { SkillSummary } from "@/entities";

export interface SkillIndexAdaptor {
  searchSkills(query: string, limit?: number): Promise<SkillSummary[]>;
}