import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

import { HermesSkillIndex } from "./hermes-skill-index";
import type { SkillIndexEntry } from "./hermes-skill-index";

function makeEntry(overrides: Partial<SkillIndexEntry> = {}): SkillIndexEntry {
  return {
    name: "git-pr-review",
    description: "Review GitHub pull requests.",
    source: "github",
    identifier: "openai/skills/skills/git-pr-review",
    trust_level: "trusted",
    repo: "openai/skills",
    path: "skills/git-pr-review",
    tags: ["code-review", "github"],
    extra: {},
    ...overrides,
  };
}

function jsonResponse(skills: SkillIndexEntry[]) {
  return { ok: true, json: async () => ({ skills }) } as Response;
}

const entries: SkillIndexEntry[] = [
  makeEntry({ name: "kubernetes", description: "Manage K8s clusters.", identifier: "official/k8s/kubernetes", tags: ["k8s"], extra: { provider: "openai" } }),
  makeEntry({ name: "kube-deploy", description: "Deploy to kubernetes.", identifier: "github/openai/kube-deploy", tags: [], extra: { provider: "openai" } }),
  makeEntry({ name: "git-pr-review", description: "Review pull requests.", identifier: "github/openai/git-pr-review", tags: ["github"], extra: {} }),
  makeEntry({ name: "apple-reminders", description: "Apple Reminders via remindctl.", identifier: "official/apple/apple-reminders", tags: ["macos"], extra: {} }),
  makeEntry({ name: "web-search", description: "Search the web.", identifier: "skills.sh/web-search", tags: ["web"], extra: { provider: "openai" } }),
];

const mixedTrustEntries: SkillIndexEntry[] = [
  makeEntry({ name: "community-deploy", description: "Deploy things.", identifier: "skills-sh/foo/bar/community-deploy", trust_level: "community", tags: ["deploy"] }),
  makeEntry({ name: "trusted-deploy", description: "Deploy trusted.", identifier: "anthropics/trusted-deploy", trust_level: "trusted", tags: ["deploy"] }),
  makeEntry({ name: "builtin-deploy", description: "Deploy builtin.", identifier: "official/builtin-deploy", trust_level: "builtin", tags: ["deploy"] }),
];

const malformedEntries: SkillIndexEntry[] = [
  { ...makeEntry({ name: "broken-name" }), name: null as unknown as string },
  makeEntry({ name: "empty-description", description: "" }),
  makeEntry({ name: "empty-identifier", identifier: "" }),
  { ...makeEntry({ name: "broken-tags" }), tags: null as unknown as string[] },
  makeEntry({ name: "unknown-trust", trust_level: "mystery" }),
  makeEntry({ name: "valid-community", identifier: "skills-sh/ok/valid-community", trust_level: "community", tags: [] }),
];

describe("HermesSkillIndex", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("searchSkills", () => {
    it("returns the first N entries in index order for an empty query", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(entries));
      const adaptor = new HermesSkillIndex();

      const results = await adaptor.searchSkills("", 3);

      expect(results).toEqual([
        { name: "kubernetes", identifier: "official/k8s/kubernetes", description: "Manage K8s clusters." },
        { name: "kube-deploy", identifier: "github/openai/kube-deploy", description: "Deploy to kubernetes." },
        { name: "git-pr-review", identifier: "github/openai/git-pr-review", description: "Review pull requests." },
      ]);
    });

    it("matches a skill by name", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(entries));
      const adaptor = new HermesSkillIndex();

      const results = await adaptor.searchSkills("kubernetes", 5);

      expect(results.some((r) => r.name === "kubernetes")).toBe(true);
    });

    it("matches case-insensitively across name, description, tags, identifier, and provider", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(entries));
      const adaptor = new HermesSkillIndex();

      const byTag = await adaptor.searchSkills("MACOS", 5);
      expect(byTag.some((r) => r.name === "apple-reminders")).toBe(true);

      const byProvider = await adaptor.searchSkills("OPENAI", 5);
      expect(byProvider.some((r) => r.name === "kubernetes")).toBe(true);

      const byIdentifier = await adaptor.searchSkills("skills.sh/web-search", 5);
      expect(byIdentifier.some((r) => r.name === "web-search")).toBe(true);
    });

    it("returns an empty array when nothing matches", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(entries));
      const adaptor = new HermesSkillIndex();

      const results = await adaptor.searchSkills("nonexistent-skill-xyz");

      expect(results).toEqual([]);
    });

    it("truncates to the limit", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(entries));
      const adaptor = new HermesSkillIndex();

      const results = await adaptor.searchSkills("", 2);

      expect(results).toHaveLength(2);
    });

    it("only returns name, identifier, and description", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(entries));
      const adaptor = new HermesSkillIndex();

      const [first] = await adaptor.searchSkills("kubernetes", 1);

      expect(Object.keys(first ?? {}).sort()).toEqual(["description", "identifier", "name"]);
    });

    it("includes community skills", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(mixedTrustEntries));
      const adaptor = new HermesSkillIndex();

      const results = await adaptor.searchSkills("deploy", 10);

      expect(results.map((r) => r.identifier)).toContain("skills-sh/foo/bar/community-deploy");
    });

    it("ranks builtin and trusted skills ahead of community ones", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(mixedTrustEntries));
      const adaptor = new HermesSkillIndex();

      const results = await adaptor.searchSkills("deploy", 10);

      expect(results.map((r) => r.identifier)).toEqual([
        "official/builtin-deploy",
        "anthropics/trusted-deploy",
        "skills-sh/foo/bar/community-deploy",
      ]);
    });

    it("drops malformed entries and unknown trust levels, keeping the valid ones", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(malformedEntries));
      const adaptor = new HermesSkillIndex();

      const results = await adaptor.searchSkills("", 100);

      expect(results.map((r) => r.identifier)).toEqual(["skills-sh/ok/valid-community"]);
    });

    it("stops matching at the limit instead of scanning past it", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(mixedTrustEntries));
      const adaptor = new HermesSkillIndex();

      const results = await adaptor.searchSkills("deploy", 2);

      expect(results.map((r) => r.identifier)).toEqual([
        "official/builtin-deploy",
        "anthropics/trusted-deploy",
      ]);
    });
  });

  describe("caching", () => {
    it("serves from cache within the TTL without refetching", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(entries));
      const adaptor = new HermesSkillIndex();

      await adaptor.searchSkills("kubernetes");
      await adaptor.searchSkills("git");

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("returns an empty array on cold-start fetch failure", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("network down"));
      const adaptor = new HermesSkillIndex();

      const results = await adaptor.searchSkills("kubernetes");

      expect(results).toEqual([]);
    });

    it("falls back to the stale cache on fetch failure after a successful fetch", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(entries)).mockRejectedValueOnce(new Error("network down"));
      const adaptor = new HermesSkillIndex();

      await adaptor.searchSkills("kubernetes");
      // Force a reload by expiring the cache.
      vi.useFakeTimers();
      vi.advanceTimersByTime(7 * 3600 * 1000);
      const results = await adaptor.searchSkills("kubernetes");
      vi.useRealTimers();

      expect(results.length).toBeGreaterThan(0);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});