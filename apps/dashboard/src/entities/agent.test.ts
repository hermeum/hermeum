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
