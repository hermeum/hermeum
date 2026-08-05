export interface SkillIndexEntry {
  name: string;
  description: string;
  source: string;
  identifier: string;
  trust_level: string;
  repo?: string;
  path?: string;
  tags: string[];
  extra?: { provider?: string; [k: string]: unknown };
  resolved_github_id?: string;
}

export interface SkillSearchResult {
  name: string;
  identifier: string;
  description: string;
}

export interface SkillIndexAdaptor {
  searchSkills(query: string, limit?: number): Promise<SkillSearchResult[]>;
}