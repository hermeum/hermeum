import { describe, it, expect } from "vitest";
import { z } from "zod";

import { AgentInputObjectSchema, AgentInputSchema, SkillSchema, isApiServerEnabled, getApiServerPort, isWebhookEnabled, getWebhookPort } from "./agent";

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    config: { platforms: { webhook: { enabled: true } } },
    ...overrides,
  };
}

describe("AgentInputSchema webhook secret validation", () => {
  it("fails when webhook is enabled via config and env is missing", () => {
    const result = AgentInputSchema.safeParse(makeInput());
    expect(result.success).toBe(false);
  });

  it("fails when webhook is enabled via config and env lacks a sensitive WEBHOOK_SECRET", () => {
    const result = AgentInputSchema.safeParse(
      makeInput({ env: [{ name: "WEBHOOK_SECRET", value: "shh" }] })
    );
    expect(result.success).toBe(false);
  });

  it("succeeds when webhook is enabled via config and env has a sensitive WEBHOOK_SECRET", () => {
    const result = AgentInputSchema.safeParse(
      makeInput({ env: [{ name: "WEBHOOK_SECRET", value: "shh", sensitive: true }] })
    );
    expect(result.success).toBe(true);
  });

  it("fails when webhook is enabled via WEBHOOK_ENABLED env var and WEBHOOK_SECRET is missing", () => {
    const result = AgentInputSchema.safeParse({
      env: [{ name: "WEBHOOK_ENABLED", value: "true" }],
    });
    expect(result.success).toBe(false);
  });

  it("succeeds when webhook is enabled via WEBHOOK_ENABLED env var and WEBHOOK_SECRET is sensitive", () => {
    const result = AgentInputSchema.safeParse({
      env: [
        { name: "WEBHOOK_ENABLED", value: "true" },
        { name: "WEBHOOK_SECRET", value: "shh", sensitive: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("succeeds when webhook is disabled regardless of env", () => {
    const result = AgentInputSchema.safeParse({
      config: { platforms: { webhook: { enabled: false } } },
    });
    expect(result.success).toBe(true);
  });

  it("succeeds when webhook config is omitted entirely", () => {
    const result = AgentInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("AgentInputSchema webhook env-vs-config precedence", () => {
  it("prefers config.platforms.webhook.enabled over WEBHOOK_ENABLED env var", () => {
    const input = {
      env: [
        { name: "WEBHOOK_ENABLED", value: "true" },
        { name: "WEBHOOK_SECRET", value: "shh", sensitive: true },
      ],
      config: { platforms: { webhook: { enabled: false } } },
    };
    const result = AgentInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(isWebhookEnabled(input as never)).toBe(false);
  });

  it("prefers config.platforms.webhook.extra.port over WEBHOOK_PORT env var", () => {
    const input = {
      env: [
        { name: "WEBHOOK_ENABLED", value: "true" },
        { name: "WEBHOOK_PORT", value: "9001" },
        { name: "WEBHOOK_SECRET", value: "shh", sensitive: true },
      ],
      config: { platforms: { webhook: { enabled: true, extra: { port: 9000 } } } },
    };
    const result = AgentInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(getWebhookPort(input as never)).toBe(9000);
  });

  it("succeeds when only the env var path is used", () => {
    const result = AgentInputSchema.safeParse({
      env: [
        { name: "WEBHOOK_ENABLED", value: "true" },
        { name: "WEBHOOK_PORT", value: "9000" },
        { name: "WEBHOOK_SECRET", value: "shh", sensitive: true },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("succeeds when only the config path is used", () => {
    const result = AgentInputSchema.safeParse({
      config: { platforms: { webhook: { enabled: true, extra: { port: 9000 } } } },
      env: [{ name: "WEBHOOK_SECRET", value: "shh", sensitive: true }],
    });
    expect(result.success).toBe(true);
  });
});

describe("AgentInputSchema api server key validation", () => {
  function makeApiServerInput(overrides: Record<string, unknown> = {}) {
    return {
      env: [{ name: "API_SERVER_ENABLED", value: "true" }],
      ...overrides,
    };
  }

  it("fails when the api server is enabled and env is missing", () => {
    const result = AgentInputSchema.safeParse({ env: [{ name: "API_SERVER_ENABLED", value: "true" }] });
    expect(result.success).toBe(false);
  });

  it("fails when the api server is enabled and env lacks a sensitive API_SERVER_KEY", () => {
    const result = AgentInputSchema.safeParse(
      makeApiServerInput({ env: [
        { name: "API_SERVER_ENABLED", value: "true" },
        { name: "API_SERVER_KEY", value: "shh" },
      ] })
    );
    expect(result.success).toBe(false);
  });

  it("succeeds when the api server is enabled and env has a sensitive API_SERVER_KEY", () => {
    const result = AgentInputSchema.safeParse(
      makeApiServerInput({ env: [
        { name: "API_SERVER_ENABLED", value: "true" },
        { name: "API_SERVER_KEY", value: "shh", sensitive: true },
      ] })
    );
    expect(result.success).toBe(true);
  });

  it("succeeds when the api server is disabled regardless of env", () => {
    const result = AgentInputSchema.safeParse({ env: [{ name: "API_SERVER_ENABLED", value: "false" }] });
    expect(result.success).toBe(true);
  });
});

describe("isApiServerEnabled", () => {
  it("returns true when API_SERVER_ENABLED is \"true\" (case-insensitive)", () => {
    for (const value of ["true", "TRUE", "True"]) {
      expect(
        isApiServerEnabled({ env: [{ name: "API_SERVER_ENABLED", value }] })
      ).toBe(true);
    }
  });

  it("returns false for non-\"true\" values", () => {
    for (const value of ["false", "1", "yes", "on", "", "true "]) {
      expect(
        isApiServerEnabled({ env: [{ name: "API_SERVER_ENABLED", value }] })
      ).toBe(false);
    }
  });

  it("returns false when env is absent or has no API_SERVER_ENABLED var", () => {
    expect(isApiServerEnabled({})).toBe(false);
    expect(isApiServerEnabled({ env: [] })).toBe(false);
    expect(isApiServerEnabled({ env: [{ name: "OTHER", value: "true" }] })).toBe(false);
  });
});

describe("getApiServerPort", () => {
  it("returns the parsed port when API_SERVER_PORT is a positive integer", () => {
    expect(getApiServerPort({ env: [{ name: "API_SERVER_PORT", value: "9000" }] })).toBe(9000);
  });

  it("falls back to 8642 when API_SERVER_PORT is missing or empty", () => {
    expect(getApiServerPort({})).toBe(8642);
    expect(getApiServerPort({ env: [] })).toBe(8642);
    expect(getApiServerPort({ env: [{ name: "API_SERVER_PORT", value: "" }] })).toBe(8642);
    expect(getApiServerPort({ env: [{ name: "API_SERVER_PORT", value: "   " }] })).toBe(8642);
  });

  it("falls back to 8642 when API_SERVER_PORT is not a positive integer", () => {
    expect(getApiServerPort({ env: [{ name: "API_SERVER_PORT", value: "0" }] })).toBe(8642);
    expect(getApiServerPort({ env: [{ name: "API_SERVER_PORT", value: "-1" }] })).toBe(8642);
    expect(getApiServerPort({ env: [{ name: "API_SERVER_PORT", value: "abc" }] })).toBe(8642);
    expect(getApiServerPort({ env: [{ name: "API_SERVER_PORT", value: "1.5" }] })).toBe(8642);
  });
});

describe("isWebhookEnabled", () => {
  it("returns true when WEBHOOK_ENABLED is \"true\" (case-insensitive)", () => {
    for (const value of ["true", "TRUE", "True"]) {
      expect(
        isWebhookEnabled({ env: [{ name: "WEBHOOK_ENABLED", value }] })
      ).toBe(true);
    }
  });

  it("returns false for non-\"true\" WEBHOOK_ENABLED values", () => {
    for (const value of ["false", "1", "yes", "on", "", "true "]) {
      expect(
        isWebhookEnabled({ env: [{ name: "WEBHOOK_ENABLED", value }] })
      ).toBe(false);
    }
  });

  it("returns true when config.platforms.webhook.enabled is true", () => {
    expect(
      isWebhookEnabled({ config: { platforms: { webhook: { enabled: true } } } })
    ).toBe(true);
  });

  it("returns false when config.platforms.webhook.enabled is false or absent", () => {
    expect(
      isWebhookEnabled({ config: { platforms: { webhook: { enabled: false } } } })
    ).toBe(false);
    expect(isWebhookEnabled({ config: { platforms: { webhook: {} } } })).toBe(false);
    expect(isWebhookEnabled({})).toBe(false);
  });

  it("prefers config.platforms.webhook.enabled over the WEBHOOK_ENABLED env var", () => {
    expect(
      isWebhookEnabled({
        env: [{ name: "WEBHOOK_ENABLED", value: "true" }],
        config: { platforms: { webhook: { enabled: false } } },
      })
    ).toBe(false);
    expect(
      isWebhookEnabled({
        env: [{ name: "WEBHOOK_ENABLED", value: "false" }],
        config: { platforms: { webhook: { enabled: true } } },
      })
    ).toBe(true);
  });
});

describe("getWebhookPort", () => {
  it("returns the parsed port when WEBHOOK_PORT is a positive integer", () => {
    expect(getWebhookPort({ env: [{ name: "WEBHOOK_PORT", value: "9000" }] })).toBe(9000);
  });

  it("falls back to 8644 when WEBHOOK_PORT is missing or empty", () => {
    expect(getWebhookPort({})).toBe(8644);
    expect(getWebhookPort({ env: [] })).toBe(8644);
    expect(getWebhookPort({ env: [{ name: "WEBHOOK_PORT", value: "" }] })).toBe(8644);
    expect(getWebhookPort({ env: [{ name: "WEBHOOK_PORT", value: "   " }] })).toBe(8644);
  });

  it("falls back to 8644 when WEBHOOK_PORT is not a positive integer", () => {
    expect(getWebhookPort({ env: [{ name: "WEBHOOK_PORT", value: "0" }] })).toBe(8644);
    expect(getWebhookPort({ env: [{ name: "WEBHOOK_PORT", value: "-1" }] })).toBe(8644);
    expect(getWebhookPort({ env: [{ name: "WEBHOOK_PORT", value: "abc" }] })).toBe(8644);
    expect(getWebhookPort({ env: [{ name: "WEBHOOK_PORT", value: "1.5" }] })).toBe(8644);
  });

  it("returns the config.platforms.webhook.extra.port when WEBHOOK_PORT env var is absent", () => {
    expect(
      getWebhookPort({ config: { platforms: { webhook: { extra: { port: 9000 } } } } })
    ).toBe(9000);
  });

  it("prefers config.platforms.webhook.extra.port over the WEBHOOK_PORT env var", () => {
    expect(
      getWebhookPort({
        env: [{ name: "WEBHOOK_PORT", value: "9001" }],
        config: { platforms: { webhook: { extra: { port: 9000 } } } },
      })
    ).toBe(9000);
  });
});

describe("AgentInputSchema env placeholder validation", () => {
  it("fails when an env var still has the fill-me placeholder value", () => {
    const result = AgentInputSchema.safeParse({
      env: [{ name: "API_KEY", value: "<fill-me>", sensitive: true }],
    });
    expect(result.success).toBe(false);
  });

  it("succeeds when env values are real, non-placeholder strings", () => {
    const result = AgentInputSchema.safeParse({
      env: [{ name: "API_KEY", value: "sk-real-value", sensitive: true }],
    });
    expect(result.success).toBe(true);
  });
});

describe("AgentInputSchema packages validation", () => {
  it("succeeds with pip and npm package lists", () => {
    const result = AgentInputSchema.safeParse({
      packages: { pip: ["requests", "pandas==2.1.0"], npm: ["typescript"] },
    });
    expect(result.success).toBe(true);
  });

  it("succeeds when packages is omitted entirely", () => {
    const result = AgentInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("succeeds with only pip or only npm set", () => {
    expect(AgentInputSchema.safeParse({ packages: { pip: ["requests"] } }).success).toBe(true);
    expect(AgentInputSchema.safeParse({ packages: { npm: ["typescript"] } }).success).toBe(true);
  });

  it("fails when a package entry is not a string", () => {
    const result = AgentInputSchema.safeParse({ packages: { pip: [123] } });
    expect(result.success).toBe(false);
  });

  it("accepts valid pip specifiers (name, version pin, extras, chained constraints)", () => {
    const result = AgentInputSchema.safeParse({
      packages: {
        pip: ["requests", "pandas==2.1.0", "mypackage[extra1,extra2]>=1.0", "numpy>=1.20,<2.0"],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects pip specifiers with shell metacharacters or whitespace", () => {
    for (const bad of ["requests; rm -rf /", "package with space", "$(evil)", "a|b", "`x`"]) {
      const result = AgentInputSchema.safeParse({ packages: { pip: [bad] } });
      expect(result.success).toBe(false);
    }
  });

  it("accepts valid npm specifiers (name, scoped, versioned)", () => {
    const result = AgentInputSchema.safeParse({
      packages: {
        npm: ["typescript", "typescript@^5.0.0", "@anthropic-ai/sdk", "@anthropic-ai/sdk@1.2.3"],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects npm specifiers with shell metacharacters or whitespace", () => {
    for (const bad of ["typescript; rm -rf /", "package with space", "$(evil)", "a|b", "`x`"]) {
      const result = AgentInputSchema.safeParse({ packages: { npm: [bad] } });
      expect(result.success).toBe(false);
    }
  });
});

describe("AgentInputSchema crons validation", () => {
  function makeCron(overrides: Record<string, unknown> = {}) {
    return {
      name: "daily-standup",
      schedule: "0 9 * * *",
      prompt: "Summarize yesterday's activity.",
      ...overrides,
    };
  }

  it("accepts a full valid cron", () => {
    const result = AgentInputSchema.safeParse({
      crons: [makeCron({ deliver: "slack", repeat: 3, skills: ["standup-summarizer"] })],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a cron missing name", () => {
    const cron = makeCron();
    delete (cron as Record<string, unknown>).name;
    const result = AgentInputSchema.safeParse({ crons: [cron] });
    expect(result.success).toBe(false);
  });

  it("rejects a cron missing schedule", () => {
    const cron = makeCron();
    delete (cron as Record<string, unknown>).schedule;
    const result = AgentInputSchema.safeParse({ crons: [cron] });
    expect(result.success).toBe(false);
  });

  it("rejects a cron missing prompt", () => {
    const cron = makeCron();
    delete (cron as Record<string, unknown>).prompt;
    const result = AgentInputSchema.safeParse({ crons: [cron] });
    expect(result.success).toBe(false);
  });

  it("rejects deliver: github_comment (not a valid cron delivery target)", () => {
    const result = AgentInputSchema.safeParse({
      crons: [makeCron({ deliver: "github_comment" })],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized deliver platform", () => {
    const result = AgentInputSchema.safeParse({ crons: [makeCron({ deliver: "carrier-pigeon" })] });
    expect(result.success).toBe(false);
  });

  it.each(["slack", "origin", "local", "all"])("accepts deliver: %s", (deliver) => {
    const result = AgentInputSchema.safeParse({ crons: [makeCron({ deliver })] });
    expect(result.success).toBe(true);
  });

  it("accepts a deliver target with a :target suffix", () => {
    const result = AgentInputSchema.safeParse({
      crons: [makeCron({ deliver: "telegram:123456" })],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a deliver target with a topic suffix", () => {
    const result = AgentInputSchema.safeParse({
      crons: [makeCron({ deliver: "telegram:-100123:17585" })],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a comma-separated fan-out deliver value", () => {
    const result = AgentInputSchema.safeParse({
      crons: [makeCron({ deliver: "telegram,discord" })],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed comma-separated deliver value", () => {
    const result = AgentInputSchema.safeParse({
      crons: [makeCron({ deliver: "telegram,,discord" })],
    });
    expect(result.success).toBe(false);
  });

  it.each(["30m", "2h", "1d", "every 30m", "every 2h", "0 */6 * * *", "2026-03-15T09:00:00"])(
    "accepts schedule: %s",
    (schedule) => {
      const result = AgentInputSchema.safeParse({ crons: [makeCron({ schedule })] });
      expect(result.success).toBe(true);
    }
  );

  it.each(["daily", "every", "30 minutes", "0 9 * *"])(
    "rejects invalid schedule: %s",
    (schedule) => {
      const result = AgentInputSchema.safeParse({ crons: [makeCron({ schedule })] });
      expect(result.success).toBe(false);
    }
  );

  it("rejects a non-positive repeat", () => {
    const result = AgentInputSchema.safeParse({ crons: [makeCron({ repeat: 0 })] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer repeat", () => {
    const result = AgentInputSchema.safeParse({ crons: [makeCron({ repeat: 1.5 })] });
    expect(result.success).toBe(false);
  });

  it("accepts loose skill strings that would fail the strict top-level SkillSchema", () => {
    const result = AgentInputSchema.safeParse({
      crons: [makeCron({ skills: ["bad skill!"] })],
    });
    expect(result.success).toBe(true);
  });
});

describe("AgentInputObjectSchema as LLM structured-output schema", () => {
  it("accepts a representative generated payload", () => {
    const result = AgentInputObjectSchema.safeParse({
      name: "pr-reviewer",
      description: "Reviews GitHub pull requests.",
      soul: "# PR Reviewer\nBe thorough and kind.",
      config: {
        model: { provider: "anthropic", default: "claude-sonnet-5" },
        platforms: { webhook: { enabled: true } },
      },
      skills: ["npm:@hermeum/github-review"],
      env: [{ name: "WEBHOOK_SECRET", value: "<fill-me>", sensitive: true }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid skill string", () => {
    const result = AgentInputObjectSchema.safeParse({ skills: ["bad skill!"] });
    expect(result.success).toBe(false);
  });

  it("is convertible to JSON Schema for the AI SDK", () => {
    expect(() => z.toJSONSchema(AgentInputObjectSchema)).not.toThrow();
  });
});

describe("SkillSchema identifier formats", () => {
  // https://hermes-agent.nousresearch.com/docs/user-guide/features/skills#supported-hub-sources

  const valid: string[] = [
    "axolotl",
    "gif-search",
    "standup-summarizer",
    "npm:@hermeum/github-review",
    "pack:./local/skill",
    "official/security/1password",
    "official/migration/openclaw-migration",
    "skills-sh/vercel-labs/agent-skills/vercel-react-best-practices",
    "browse-sh/airbnb.com/search-listings-ddgioa",
    "clawhub/some-org/some-skill",
    "lobehub/some-org/some-skill",
    "claude-marketplace/some-org/some-skill",
    "well-known:https://mintlify.com/docs/.well-known/skills/mintlify",
    "https://sharethis.chat/SKILL.md",
    "https://example.com/my-skill/SKILL.md",
    "openai/skills/k8s",
    "anthropics/skills/pdf",
    "owner/repo/skills/my-workflow",
  ];

  it.each(valid)("accepts %s", (identifier) => {
    expect(SkillSchema.safeParse(identifier).success).toBe(true);
  });

  const invalid: string[] = [
    "bad skill!",
    "npm:",
    "pack:",
    "official/",
    "skills-sh/",
    "browse-sh/",
    "clawhub/",
    "lobehub/",
    "claude-marketplace/",
    "well-known:not-a-url",
    "ftp://example.com/SKILL.md",
    "http://",
    "https://",
    "/openai",
    "openai/",
    "1bad",
    "with space",
  ];

  it.each(invalid)("rejects %s", (identifier) => {
    const result = SkillSchema.safeParse(identifier);
    expect(result.success).toBe(false);
  });

  it("rejects a skill exceeding 128 characters", () => {
    const result = SkillSchema.safeParse("a".repeat(129));
    expect(result.success).toBe(false);
  });

  it("accepts a 128-character skill", () => {
    const result = SkillSchema.safeParse("a".repeat(128));
    expect(result.success).toBe(true);
  });
});

describe("AgentInputSchema web config validation", () => {
  it("accepts a searxng search_backend with a paired extract_backend", () => {
    const result = AgentInputSchema.safeParse({
      config: { web: { search_backend: "searxng", extract_backend: "firecrawl" } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts the single-backend form", () => {
    const result = AgentInputSchema.safeParse({ config: { web: { backend: "searxng" } } });
    expect(result.success).toBe(true);
  });

  it("passes search_backend through without enum validation", () => {
    const result = AgentInputSchema.safeParse({
      config: { web: { search_backend: "google" } },
    });
    expect(result.success).toBe(true);
  });

  it("passes extract_backend through without enum validation", () => {
    const result = AgentInputSchema.safeParse({
      config: { web: { extract_backend: "ddgs" } },
    });
    expect(result.success).toBe(true);
  });
});

describe("AgentInputSchema browser config validation", () => {
  it("accepts cloud_provider: camofox", () => {
    const result = AgentInputSchema.safeParse({
      config: { browser: { cloud_provider: "camofox" } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a cloud provider", () => {
    const result = AgentInputSchema.safeParse({
      config: { browser: { cloud_provider: "browserbase" } },
    });
    expect(result.success).toBe(true);
  });

  it("passes cloud_provider through without enum validation", () => {
    const result = AgentInputSchema.safeParse({
      config: { browser: { cloud_provider: "playwright" } },
    });
    expect(result.success).toBe(true);
  });
});
