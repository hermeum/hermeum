import { describe, it, expect } from "vitest";
import { z } from "zod";

import { AgentInputObjectSchema, AgentInputSchema, SkillSchema, isApiServerEnabled, getApiServerPort, isWebhookEnabled, getWebhookPort, isTeamsEnabled, getTeamsPort, ToolsetId, deriveToolsetAvailability, PlatformId, derivePlatformAvailability, type Agent } from "./agent";

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

describe("AgentInputSchema teams secret validation", () => {
  const teamsCredsEnv = [
    { name: "TEAMS_CLIENT_ID", value: "cid" },
    { name: "TEAMS_CLIENT_SECRET", value: "sec", sensitive: true },
    { name: "TEAMS_TENANT_ID", value: "tid" },
  ];

  it("fails when teams is enabled via creds and env lacks sensitive TEAMS_CLIENT_SECRET", () => {
    const result = AgentInputSchema.safeParse({
      env: [
        { name: "TEAMS_CLIENT_ID", value: "cid" },
        { name: "TEAMS_CLIENT_SECRET", value: "sec" },
        { name: "TEAMS_TENANT_ID", value: "tid" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("succeeds when teams is enabled and TEAMS_CLIENT_SECRET is sensitive", () => {
    const result = AgentInputSchema.safeParse({ env: teamsCredsEnv });
    expect(result.success).toBe(true);
  });

  it("fails when teams is enabled via config flag and TEAMS_CLIENT_SECRET is missing", () => {
    const result = AgentInputSchema.safeParse({
      config: { platforms: { teams: { enabled: true } } },
      env: [
        { name: "TEAMS_CLIENT_ID", value: "cid" },
        { name: "TEAMS_TENANT_ID", value: "tid" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("succeeds when teams is explicitly disabled regardless of env", () => {
    const result = AgentInputSchema.safeParse({
      config: { platforms: { teams: { enabled: false } } },
      env: teamsCredsEnv,
    });
    expect(result.success).toBe(true);
  });

  it("succeeds when teams config is omitted entirely", () => {
    const result = AgentInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("isTeamsEnabled", () => {
  const teamsCredsEnv = [
    { name: "TEAMS_CLIENT_ID", value: "cid" },
    { name: "TEAMS_CLIENT_SECRET", value: "sec", sensitive: true },
    { name: "TEAMS_TENANT_ID", value: "tid" },
  ];

  it("is enabled when all three credentials are in env", () => {
    expect(isTeamsEnabled({ env: teamsCredsEnv })).toBe(true);
  });

  it("is disabled when any credential is missing from env", () => {
    expect(isTeamsEnabled({ env: teamsCredsEnv.slice(0, 2) })).toBe(false);
    expect(
      isTeamsEnabled({ env: [{ name: "TEAMS_CLIENT_ID", value: "cid" }] })
    ).toBe(false);
    expect(isTeamsEnabled({})).toBe(false);
  });

  it("treats the <secret> sentinel for sensitive TEAMS_CLIENT_SECRET as set", () => {
    expect(
      isTeamsEnabled({
        env: [
          { name: "TEAMS_CLIENT_ID", value: "cid" },
          { name: "TEAMS_CLIENT_SECRET", value: "<secret>", sensitive: true },
          { name: "TEAMS_TENANT_ID", value: "tid" },
        ],
      })
    ).toBe(true);
  });

  it("prefers config.platforms.teams.enabled=false over present credentials", () => {
    expect(
      isTeamsEnabled({
        env: teamsCredsEnv,
        config: { platforms: { teams: { enabled: false } } },
      })
    ).toBe(false);
  });

  it("prefers config.platforms.teams.enabled=true over missing credentials", () => {
    expect(
      isTeamsEnabled({
        config: { platforms: { teams: { enabled: true } } },
      })
    ).toBe(true);
  });

  it("ignores whitespace-only credential values", () => {
    expect(
      isTeamsEnabled({
        env: [
          { name: "TEAMS_CLIENT_ID", value: "  " },
          { name: "TEAMS_CLIENT_SECRET", value: "sec", sensitive: true },
          { name: "TEAMS_TENANT_ID", value: "tid" },
        ],
      })
    ).toBe(false);
  });
});

describe("getTeamsPort", () => {
  it("returns the parsed port when TEAMS_PORT is a positive integer", () => {
    expect(getTeamsPort({ env: [{ name: "TEAMS_PORT", value: "4000" }] })).toBe(4000);
  });

  it("falls back to 3978 when TEAMS_PORT is missing or empty", () => {
    expect(getTeamsPort({})).toBe(3978);
    expect(getTeamsPort({ env: [] })).toBe(3978);
    expect(getTeamsPort({ env: [{ name: "TEAMS_PORT", value: "" }] })).toBe(3978);
    expect(getTeamsPort({ env: [{ name: "TEAMS_PORT", value: "   " }] })).toBe(3978);
  });

  it("falls back to 3978 when TEAMS_PORT is not a positive integer", () => {
    expect(getTeamsPort({ env: [{ name: "TEAMS_PORT", value: "0" }] })).toBe(3978);
    expect(getTeamsPort({ env: [{ name: "TEAMS_PORT", value: "-1" }] })).toBe(3978);
    expect(getTeamsPort({ env: [{ name: "TEAMS_PORT", value: "abc" }] })).toBe(3978);
    expect(getTeamsPort({ env: [{ name: "TEAMS_PORT", value: "1.5" }] })).toBe(3978);
  });

  it("returns config.platforms.teams.extra.port when TEAMS_PORT env var is absent", () => {
    expect(
      getTeamsPort({ config: { platforms: { teams: { extra: { port: 4000 } } } } })
    ).toBe(4000);
  });

  it("prefers config.platforms.teams.extra.port over the TEAMS_PORT env var", () => {
    expect(
      getTeamsPort({
        env: [{ name: "TEAMS_PORT", value: "4001" }],
        config: { platforms: { teams: { extra: { port: 4000 } } } },
      })
    ).toBe(4000);
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

  it("rejects an unknown search_backend", () => {
    const result = AgentInputSchema.safeParse({
      config: { web: { search_backend: "google" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a search-only backend used as extract_backend", () => {
    const result = AgentInputSchema.safeParse({
      config: { web: { extract_backend: "ddgs" } },
    });
    expect(result.success).toBe(false);
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

  it("rejects an unknown cloud_provider", () => {
    const result = AgentInputSchema.safeParse({
      config: { browser: { cloud_provider: "playwright" } },
    });
    expect(result.success).toBe(false);
  });
});

describe("deriveToolsetAvailability", () => {
  function makeAgent(overrides: Partial<Agent> = {}): Agent {
    return { id: "a1", userId: "u1", ...overrides } as Agent;
  }

  it("marks no-gate toolsets available with no config", () => {
    const agent = makeAgent();
    // Toolsets gated in Hermeum (all others fall through to available).
    const gated = new Set<ToolsetId>([
      ToolsetId.Web, ToolsetId.XSearch, ToolsetId.Browser,
      ToolsetId.HomeAssistant, ToolsetId.ImageGen, ToolsetId.VideoGen,
      ToolsetId.Spotify, ToolsetId.Discord, ToolsetId.DiscordAdmin,
      ToolsetId.ComputerUse, ToolsetId.Yuanbao,
    ]);
    const noGate = (Object.values(ToolsetId) as ToolsetId[]).filter((id) => !gated.has(id));
    for (const id of noGate) {
      expect(deriveToolsetAvailability(id, agent).status).toBe("available");
    }
  });

  it("marks web unavailable without a backend and available with one", () => {
    expect(deriveToolsetAvailability(ToolsetId.Web, makeAgent()).status).toBe("unavailable");
    expect(
      deriveToolsetAvailability(ToolsetId.Web, makeAgent({ config: { web: { backend: "searxng" } } }))
        .status
    ).toBe("available");
    expect(
      deriveToolsetAvailability(
        ToolsetId.Web,
        makeAgent({ config: { web: { search_backend: "tavily" } } })
      ).status
    ).toBe("available");
  });

  it("marks x search unavailable by default and available with XAI_API_KEY or xai backend", () => {
    expect(deriveToolsetAvailability(ToolsetId.XSearch, makeAgent()).status).toBe("unavailable");
    expect(
      deriveToolsetAvailability(
        ToolsetId.XSearch,
        makeAgent({ env: [{ name: "XAI_API_KEY", value: "xai-123", sensitive: true }] })
      ).status
    ).toBe("available");
    expect(
      deriveToolsetAvailability(
        ToolsetId.XSearch,
        makeAgent({ config: { web: { search_backend: "xai" } } })
      ).status
    ).toBe("available");
  });

  it("marks browser unavailable without a provider and available with one", () => {
    expect(deriveToolsetAvailability(ToolsetId.Browser, makeAgent()).status).toBe("unavailable");
    expect(
      deriveToolsetAvailability(
        ToolsetId.Browser,
        makeAgent({ config: { browser: { cloud_provider: "camofox" } } })
      ).status
    ).toBe("available");
  });

  it("marks home assistant unavailable without HASS_TOKEN and available with it", () => {
    expect(deriveToolsetAvailability(ToolsetId.HomeAssistant, makeAgent()).status).toBe("unavailable");
    expect(
      deriveToolsetAvailability(
        ToolsetId.HomeAssistant,
        makeAgent({ env: [{ name: "HASS_TOKEN", value: "ha-token", sensitive: true }] })
      ).status
    ).toBe("available");
  });

  it("marks discord / discord_admin unavailable without DISCORD_BOT_TOKEN and available with it", () => {
    expect(deriveToolsetAvailability(ToolsetId.Discord, makeAgent()).status).toBe("unavailable");
    expect(deriveToolsetAvailability(ToolsetId.DiscordAdmin, makeAgent()).status).toBe("unavailable");
    const agent = makeAgent({
      env: [{ name: "DISCORD_BOT_TOKEN", value: "bot-token", sensitive: true }],
    });
    expect(deriveToolsetAvailability(ToolsetId.Discord, agent).status).toBe("available");
    expect(deriveToolsetAvailability(ToolsetId.DiscordAdmin, agent).status).toBe("available");
  });

  it("marks image_gen unavailable without FAL_KEY or gateway and available with either", () => {
    expect(deriveToolsetAvailability(ToolsetId.ImageGen, makeAgent()).status).toBe("unavailable");
    expect(
      deriveToolsetAvailability(
        ToolsetId.ImageGen,
        makeAgent({ env: [{ name: "FAL_KEY", value: "fal-key", sensitive: true }] })
      ).status
    ).toBe("available");
    expect(
      deriveToolsetAvailability(
        ToolsetId.ImageGen,
        makeAgent({ config: { image_gen: { use_gateway: true } } })
      ).status
    ).toBe("available");
  });

  it("marks video_gen unavailable without FAL_KEY or XAI_API_KEY and available with either", () => {
    expect(deriveToolsetAvailability(ToolsetId.VideoGen, makeAgent()).status).toBe("unavailable");
    expect(
      deriveToolsetAvailability(
        ToolsetId.VideoGen,
        makeAgent({ env: [{ name: "FAL_KEY", value: "fal-key", sensitive: true }] })
      ).status
    ).toBe("available");
    expect(
      deriveToolsetAvailability(
        ToolsetId.VideoGen,
        makeAgent({ env: [{ name: "XAI_API_KEY", value: "xai-123", sensitive: true }] })
      ).status
    ).toBe("available");
  });

  it("marks spotify, computer_use, and yuanbao always unavailable", () => {
    expect(deriveToolsetAvailability(ToolsetId.Spotify, makeAgent()).status).toBe("unavailable");
    expect(deriveToolsetAvailability(ToolsetId.ComputerUse, makeAgent()).status).toBe("unavailable");
    expect(deriveToolsetAvailability(ToolsetId.Yuanbao, makeAgent()).status).toBe("unavailable");
  });
});

describe("derivePlatformAvailability", () => {
  function makeAgent(overrides: Partial<Agent> = {}): Agent {
    return { id: "a1", userId: "u1", ...overrides } as Agent;
  }

  describe("api-server", () => {
    it("is unavailable by default", () => {
      const result = derivePlatformAvailability(PlatformId.ApiServer, makeAgent());
      expect(result.status).toBe("unavailable");
      expect(result.reason).toContain("API_SERVER_ENABLED");
    });

    it("is available with the default port when enabled", () => {
      const result = derivePlatformAvailability(
        PlatformId.ApiServer,
        makeAgent({ env: [{ name: "API_SERVER_ENABLED", value: "true" }] })
      );
      expect(result).toEqual({ status: "available", port: 8642 });
    });

    it("uses API_SERVER_PORT when set", () => {
      const result = derivePlatformAvailability(
        PlatformId.ApiServer,
        makeAgent({
          env: [
            { name: "API_SERVER_ENABLED", value: "true" },
            { name: "API_SERVER_PORT", value: "9000" },
          ],
        })
      );
      expect(result).toEqual({ status: "available", port: 9000 });
    });

    it("derives endpoints with /v1 first then /api when agent.endpoint is set", () => {
      const result = derivePlatformAvailability(
        PlatformId.ApiServer,
        makeAgent({
          endpoint: "https://a1.example.com",
          env: [{ name: "API_SERVER_ENABLED", value: "true" }],
        })
      );
      expect(result.endpoints).toEqual([
        "https://a1.example.com/v1",
        "https://a1.example.com/api",
      ]);
    });

    it("inserts the per-platform port into internal (.svc.cluster.local) endpoints", () => {
      const result = derivePlatformAvailability(
        PlatformId.ApiServer,
        makeAgent({
          endpoint: "http://a1.hermeum.svc.cluster.local",
          env: [{ name: "API_SERVER_ENABLED", value: "true" }],
        })
      );
      expect(result.endpoints).toEqual([
        "http://a1.hermeum.svc.cluster.local:8642/v1",
        "http://a1.hermeum.svc.cluster.local:8642/api",
      ]);
    });

    it("inserts a custom API_SERVER_PORT into internal endpoints", () => {
      const result = derivePlatformAvailability(
        PlatformId.ApiServer,
        makeAgent({
          endpoint: "http://a1.hermeum.svc.cluster.local",
          env: [
            { name: "API_SERVER_ENABLED", value: "true" },
            { name: "API_SERVER_PORT", value: "9000" },
          ],
        })
      );
      expect(result.endpoints).toEqual([
        "http://a1.hermeum.svc.cluster.local:9000/v1",
        "http://a1.hermeum.svc.cluster.local:9000/api",
      ]);
    });

    it("omits endpoints when agent.endpoint is null", () => {
      const result = derivePlatformAvailability(
        PlatformId.ApiServer,
        makeAgent({ env: [{ name: "API_SERVER_ENABLED", value: "true" }] })
      );
      expect(result.endpoints).toBeUndefined();
    });

    it("omits endpoints when unavailable", () => {
      const result = derivePlatformAvailability(PlatformId.ApiServer, makeAgent());
      expect(result.endpoints).toBeUndefined();
    });
  });

  describe("webhook", () => {
    it("is unavailable by default", () => {
      const result = derivePlatformAvailability(PlatformId.Webhook, makeAgent());
      expect(result.status).toBe("unavailable");
      expect(result.reason).toContain("WEBHOOK_ENABLED");
    });

    it("is available with the default port when enabled via config", () => {
      const result = derivePlatformAvailability(
        PlatformId.Webhook,
        makeAgent({ config: { platforms: { webhook: { enabled: true } } } })
      );
      expect(result).toEqual({ status: "available", port: 8644 });
    });

    it("uses config.platforms.webhook.extra.port when set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Webhook,
        makeAgent({ config: { platforms: { webhook: { enabled: true, extra: { port: 9000 } } } } })
      );
      expect(result).toEqual({ status: "available", port: 9000 });
    });

    it("is available via WEBHOOK_ENABLED env var and respects WEBHOOK_PORT", () => {
      const result = derivePlatformAvailability(
        PlatformId.Webhook,
        makeAgent({
          env: [
            { name: "WEBHOOK_ENABLED", value: "true" },
            { name: "WEBHOOK_PORT", value: "9001" },
          ],
        })
      );
      expect(result).toEqual({ status: "available", port: 9001 });
    });

    it("derives the /webhooks endpoint when agent.endpoint is set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Webhook,
        makeAgent({
          endpoint: "https://a1.example.com",
          config: { platforms: { webhook: { enabled: true } } },
        })
      );
      expect(result.endpoints).toEqual(["https://a1.example.com/webhooks"]);
    });

    it("inserts the webhook port into internal (.svc.cluster.local) endpoints", () => {
      const result = derivePlatformAvailability(
        PlatformId.Webhook,
        makeAgent({
          endpoint: "http://a1.hermeum.svc.cluster.local",
          config: { platforms: { webhook: { enabled: true } } },
        })
      );
      expect(result.endpoints).toEqual([
        "http://a1.hermeum.svc.cluster.local:8644/webhooks",
      ]);
    });

    it("omits endpoints when agent.endpoint is null even when enabled", () => {
      const result = derivePlatformAvailability(
        PlatformId.Webhook,
        makeAgent({ config: { platforms: { webhook: { enabled: true } } } })
      );
      expect(result.endpoints).toBeUndefined();
    });

    it("is unavailable via config even when the WEBHOOK_ENABLED env var is set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Webhook,
        makeAgent({
          config: { platforms: { webhook: { enabled: false } } },
          env: [{ name: "WEBHOOK_ENABLED", value: "true" }],
        })
      );
      expect(result.status).toBe("unavailable");
    });
  });

  describe("slack", () => {
    const slackEnv = [
      { name: "SLACK_BOT_TOKEN", value: "xoxb-1", sensitive: true },
      { name: "SLACK_APP_TOKEN", value: "xapp-1", sensitive: true },
      { name: "SLACK_ALLOWED_USERS", value: "U01" },
    ];

    const slackSecretSentinelEnv = [
      { name: "SLACK_BOT_TOKEN", value: "<secret>", sensitive: true },
      { name: "SLACK_APP_TOKEN", value: "<secret>", sensitive: true },
      { name: "SLACK_ALLOWED_USERS", value: "U01" },
    ];

    it("is unavailable when all three required env vars are missing", () => {
      const result = derivePlatformAvailability(PlatformId.Slack, makeAgent());
      expect(result.status).toBe("unavailable");
      expect(result.reason).toContain("SLACK_BOT_TOKEN");
      expect(result.reason).toContain("SLACK_APP_TOKEN");
      expect(result.reason).toContain("SLACK_ALLOWED_USERS");
    });

    it("names only the missing env vars when some are set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Slack,
        makeAgent({ env: [{ name: "SLACK_BOT_TOKEN", value: "xoxb-1", sensitive: true }] })
      );
      expect(result.status).toBe("unavailable");
      expect(result.reason).not.toContain("SLACK_BOT_TOKEN");
      expect(result.reason).toContain("SLACK_APP_TOKEN");
      expect(result.reason).toContain("SLACK_ALLOWED_USERS");
    });

    it("is available with no home when all three required env vars are set", () => {
      const result = derivePlatformAvailability(PlatformId.Slack, makeAgent({ env: slackEnv }));
      expect(result).toEqual({ status: "available" });
    });

    it("never exposes endpoints — Slack uses Socket Mode", () => {
      const result = derivePlatformAvailability(
        PlatformId.Slack,
        makeAgent({ endpoint: "https://a1.example.com", env: slackEnv })
      );
      expect(result.endpoints).toBeUndefined();
    });

    it("treats the <secret> sentinel for sensitive tokens as set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Slack,
        makeAgent({ env: slackSecretSentinelEnv })
      );
      expect(result.status).toBe("available");
    });

    it("reports SLACK_HOME_CHANNEL as home when set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Slack,
        makeAgent({ env: [...slackEnv, { name: "SLACK_HOME_CHANNEL", value: "C0123" }] })
      );
      expect(result).toEqual({ status: "available", home: "C0123" });
    });

    it("appends SLACK_HOME_CHANNEL_NAME when set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Slack,
        makeAgent({
          env: [
            ...slackEnv,
            { name: "SLACK_HOME_CHANNEL", value: "C0123" },
            { name: "SLACK_HOME_CHANNEL_NAME", value: "ops" },
          ],
        })
      );
      expect(result).toEqual({ status: "available", home: "C0123 (ops)" });
    });

    it("is available even when config.slack is present but no env credentials", () => {
      // config.slack holds behavior knobs only; credentials come from env.
      const result = derivePlatformAvailability(
        PlatformId.Slack,
        makeAgent({ config: { slack: { allowed_channels: ["C01"] } } })
      );
      expect(result.status).toBe("unavailable");
    });
  });

  describe("discord", () => {
    const discordEnv = [
      { name: "DISCORD_BOT_TOKEN", value: "bot-token", sensitive: true },
    ];

    it("is unavailable when DISCORD_BOT_TOKEN is missing", () => {
      const result = derivePlatformAvailability(PlatformId.Discord, makeAgent());
      expect(result.status).toBe("unavailable");
      expect(result.reason).toContain("DISCORD_BOT_TOKEN");
    });

    it("is available with no home when DISCORD_BOT_TOKEN is set", () => {
      const result = derivePlatformAvailability(PlatformId.Discord, makeAgent({ env: discordEnv }));
      expect(result).toEqual({ status: "available" });
    });

    it("never exposes endpoints — Discord uses the Gateway WebSocket", () => {
      const result = derivePlatformAvailability(
        PlatformId.Discord,
        makeAgent({ endpoint: "https://a1.example.com", env: discordEnv })
      );
      expect(result.endpoints).toBeUndefined();
    });

    it("reports DISCORD_HOME_CHANNEL as home when set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Discord,
        makeAgent({ env: [...discordEnv, { name: "DISCORD_HOME_CHANNEL", value: "1234567890" }] })
      );
      expect(result).toEqual({ status: "available", home: "1234567890" });
    });

    it("appends DISCORD_HOME_CHANNEL_NAME when set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Discord,
        makeAgent({
          env: [
            ...discordEnv,
            { name: "DISCORD_HOME_CHANNEL", value: "1234567890" },
            { name: "DISCORD_HOME_CHANNEL_NAME", value: "bot-updates" },
          ],
        })
      );
      expect(result).toEqual({ status: "available", home: "1234567890 (bot-updates)" });
    });

    it("is unavailable when config.discord is present but no env credentials", () => {
      // config.discord holds behavior knobs only; credentials come from env.
      const result = derivePlatformAvailability(
        PlatformId.Discord,
        makeAgent({ config: { discord: { require_mention: true } } })
      );
      expect(result.status).toBe("unavailable");
    });
  });

  describe("teams", () => {
    const teamsCredsEnv = [
      { name: "TEAMS_CLIENT_ID", value: "cid" },
      { name: "TEAMS_CLIENT_SECRET", value: "sec", sensitive: true },
      { name: "TEAMS_TENANT_ID", value: "tid" },
    ];

    it("is unavailable when all credentials are missing", () => {
      const result = derivePlatformAvailability(PlatformId.Teams, makeAgent());
      expect(result.status).toBe("unavailable");
      expect(result.reason).toContain("TEAMS_CLIENT_ID");
      expect(result.reason).toContain("TEAMS_CLIENT_SECRET");
      expect(result.reason).toContain("TEAMS_TENANT_ID");
    });

    it("names only the missing credentials when some are set", () => {
      const result = derivePlatformAvailability(
        PlatformId.Teams,
        makeAgent({ env: [{ name: "TEAMS_CLIENT_ID", value: "cid" }] })
      );
      expect(result.status).toBe("unavailable");
      expect(result.reason).not.toContain("TEAMS_CLIENT_ID");
      expect(result.reason).toContain("TEAMS_CLIENT_SECRET");
      expect(result.reason).toContain("TEAMS_TENANT_ID");
    });

    it("is unavailable when enabled:false is explicit (even with creds present)", () => {
      const result = derivePlatformAvailability(
        PlatformId.Teams,
        makeAgent({ env: teamsCredsEnv, config: { platforms: { teams: { enabled: false } } } })
      );
      expect(result.status).toBe("unavailable");
      expect(result.reason).toContain("Disabled");
    });

    it("is available with no home when all credentials are set via env", () => {
      const result = derivePlatformAvailability(
        PlatformId.Teams,
        makeAgent({ env: teamsCredsEnv })
      );
      expect(result.status).toBe("available");
      expect(result.port).toBe(3978);
      expect(result.home).toBeUndefined();
    });

    it("is available when enabled:true is set explicitly without env creds", () => {
      const result = derivePlatformAvailability(
        PlatformId.Teams,
        makeAgent({ config: { platforms: { teams: { enabled: true } } } })
      );
      expect(result.status).toBe("available");
      expect(result.port).toBe(3978);
    });

    it("reports endpoints on an ingress base URL (no port inserted)", () => {
      const result = derivePlatformAvailability(
        PlatformId.Teams,
        makeAgent({ endpoint: "https://a1.example.com", env: teamsCredsEnv })
      );
      expect(result.status).toBe("available");
      expect(result.endpoints).toEqual(["https://a1.example.com/api/messages"]);
    });

    it("inserts the port on internal .svc.cluster.local endpoints", () => {
      const result = derivePlatformAvailability(
        PlatformId.Teams,
        makeAgent({
          endpoint: "http://a1.agents.svc.cluster.local",
          env: teamsCredsEnv,
        })
      );
      expect(result.endpoints).toEqual([
        "http://a1.agents.svc.cluster.local:3978/api/messages",
      ]);
    });

    it("respects a custom TEAMS_PORT env var in the endpoint URL", () => {
      const result = derivePlatformAvailability(
        PlatformId.Teams,
        makeAgent({
          endpoint: "http://a1.agents.svc.cluster.local",
          env: [...teamsCredsEnv, { name: "TEAMS_PORT", value: "4000" }],
        })
      );
      expect(result.port).toBe(4000);
      expect(result.endpoints).toEqual([
        "http://a1.agents.svc.cluster.local:4000/api/messages",
      ]);
    });
  });
});
