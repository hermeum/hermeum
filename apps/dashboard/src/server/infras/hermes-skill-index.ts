import {
  SkillIndexAdaptor,
  SkillIndexEntry,
  SkillSearchResult,
} from "../usecases/adaptors/skill-index";

const INDEX_URL = "https://hermes-agent.nousresearch.com/docs/api/skills-index.json";
const CACHE_TTL_MS = 6 * 3600 * 1000;

export class HermesSkillIndexAdaptor implements SkillIndexAdaptor {
  #cache: { fetchedAt: number; skills: SkillIndexEntry[] } | null = null;

  async #loadIndex(): Promise<SkillIndexEntry[]> {
    const now = Date.now();
    if (this.#cache && now - this.#cache.fetchedAt < CACHE_TTL_MS) {
      return this.#cache.skills;
    }

    let skills: SkillIndexEntry[] | null = null;
    try {
      const resp = await fetch(INDEX_URL, {
        headers: { "Accept-Encoding": "gzip, deflate" },
      });
      if (resp.ok) {
        const data = (await resp.json()) as { skills?: SkillIndexEntry[] };
        if (Array.isArray(data.skills)) {
          skills = data.skills;
        }
      }
    } catch {
      // network / parse failure — fall through to stale-or-empty below
    }

    if (skills === null) {
      // Stale cache is better than nothing; cold-start failure → empty.
      return this.#cache?.skills ?? [];
    }

    this.#cache = { fetchedAt: now, skills };
    return skills;
  }

  async searchSkills(query: string, limit = 25): Promise<SkillSearchResult[]> {
    const skills = await this.#loadIndex();
    if (skills.length === 0) {
      return [];
    }

    const toResult = (entry: SkillIndexEntry): SkillSearchResult => ({
      name: entry.name,
      identifier: entry.identifier,
      description: entry.description,
    });

    const queryLower = query.trim().toLowerCase();
    if (queryLower === "") {
      return skills.slice(0, limit).map(toResult);
    }

    const results: SkillSearchResult[] = [];
    for (const s of skills) {
      const haystack = [
        s.name,
        s.description,
        ...s.tags,
        s.identifier,
        s.extra?.provider ?? "",
      ].join(" ").toLowerCase();

      if (haystack.includes(queryLower)) {
        results.push(toResult(s));
      }
      if (results.length >= limit) {
        break;
      }
    }
    return results;
  }
}