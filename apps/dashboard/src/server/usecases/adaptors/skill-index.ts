export interface SkillSearchResult {
  name: string;
  identifier: string;
  description: string;
}

export interface SkillIndexAdaptor {
  searchSkills(query: string, limit?: number): Promise<SkillSearchResult[]>;
}