import { describe, it, expect } from "vitest";
import { z } from "zod";

import { AgentInputObjectSchema, AgentInputSchema } from "./agent";

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    config: { platforms: { webhook: { enabled: true } } },
    ...overrides,
  };
}

describe("AgentInputSchema webhook secret validation", () => {
  it("fails when webhook is enabled and env is missing", () => {
    const result = AgentInputSchema.safeParse(makeInput());
    expect(result.success).toBe(false);
  });

  it("fails when webhook is enabled and env lacks a sensitive WEBHOOK_SECRET", () => {
    const result = AgentInputSchema.safeParse(
      makeInput({ env: [{ name: "WEBHOOK_SECRET", value: "shh" }] })
    );
    expect(result.success).toBe(false);
  });

  it("succeeds when webhook is enabled and env has a sensitive WEBHOOK_SECRET", () => {
    const result = AgentInputSchema.safeParse(
      makeInput({ env: [{ name: "WEBHOOK_SECRET", value: "shh", sensitive: true }] })
    );
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

describe("AgentInputSchema api server key validation", () => {
  function makeApiServerInput(overrides: Record<string, unknown> = {}) {
    return {
      config: { api_server: { enabled: true } },
      ...overrides,
    };
  }

  it("fails when the api server is enabled and env is missing", () => {
    const result = AgentInputSchema.safeParse(makeApiServerInput());
    expect(result.success).toBe(false);
  });

  it("fails when the api server is enabled and env lacks a sensitive API_SERVER_KEY", () => {
    const result = AgentInputSchema.safeParse(
      makeApiServerInput({ env: [{ name: "API_SERVER_KEY", value: "shh" }] })
    );
    expect(result.success).toBe(false);
  });

  it("succeeds when the api server is enabled and env has a sensitive API_SERVER_KEY", () => {
    const result = AgentInputSchema.safeParse(
      makeApiServerInput({ env: [{ name: "API_SERVER_KEY", value: "shh", sensitive: true }] })
    );
    expect(result.success).toBe(true);
  });

  it("succeeds when the api server is disabled regardless of env", () => {
    const result = AgentInputSchema.safeParse({ config: { api_server: { enabled: false } } });
    expect(result.success).toBe(true);
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
