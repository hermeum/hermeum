import { SkillSummary } from "@/entities";

import { SkillIndexAdaptor } from "../usecases/adaptors/skill-index";

const INDEX_URL = "https://hermes-agent.nousresearch.com/docs/api/skills-index.json";
const CACHE_TTL_MS = 6 * 3600 * 1000;
// Community skills are unvetted (some sources have malformed `name` fields), so
// entries are sanitized before entering the cache, and lower-trust skills always
// rank behind higher-trust ones in search results (builtin → trusted →
// community). https://github.com/hermeum/hermeum/pull/80
const TRUST_RANK: Record<string, number> = { builtin: 0, trusted: 1, community: 2 };
const ALLOWED_TRUST_LEVELS = new Set(Object.keys(TRUST_RANK));

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

export class HermesSkillIndex implements SkillIndexAdaptor {
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

    this.#cache = {
      fetchedAt: now,
      skills: HermesSkillIndex.#sanitize(skills),
    };
    return this.#cache.skills;
  }

  // Community entries are unvetted and some upstream sources have malformed
  // fields; drop anything that doesn't carry the strings the search relies on.
  // Results are grouped builtin → trusted → community, preserving index order
  // within each group.
  static #sanitize(skills: SkillIndexEntry[]): SkillIndexEntry[] {
    const ranked: SkillIndexEntry[][] = [[], [], []];
    for (const s of skills) {
      if (!ALLOWED_TRUST_LEVELS.has(s.trust_level)) continue;
      if (
        typeof s.name !== "string" ||
        typeof s.identifier !== "string" ||
        typeof s.description !== "string" ||
        s.name === "" ||
        s.identifier === "" ||
        s.description === "" ||
        !Array.isArray(s.tags)
      ) {
        continue;
      }
      const rank = TRUST_RANK[s.trust_level] ?? -1;
      if (rank === -1) continue;
      ranked[rank]!.push(s);
    }
    return ranked.flat();
  }

  async searchSkills(query: string, limit = 25): Promise<SkillSummary[]> {
    const skills = await this.#loadIndex();
    if (skills.length === 0) {
      return [];
    }

    const toResult = (entry: SkillIndexEntry): SkillSummary => ({
      name: entry.name,
      identifier: entry.identifier,
      description: entry.description,
    });

    const queryLower = query.trim().toLowerCase();
    if (queryLower === "") {
      return skills.slice(0, limit).map(toResult);
    }

    const results: SkillSummary[] = [];
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
        if (results.length >= limit) {
          break;
        }
      }
    }
    return results;
  }
}