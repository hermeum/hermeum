import { describe, it, expect } from "vitest";

import {
  agentEnvResourceName,
  agentToHermesAgent,
  hashAgentEnv,
  mapHermesAgent,
  mapHermesConfig,
  maskSensitiveEnv,
  splitAgentEnv,
} from "./client";
import type { Agent } from "@/entities";
import type { HermesAgent } from "./types/hermes-agent";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    userId: "user-1",
    ...overrides,
  } as Agent;
}

describe("agentEnvResourceName", () => {
  it("derives the ConfigMap/Secret name from the agent id", () => {
    expect(agentEnvResourceName("agent-1")).toBe("agent-1-dot-env");
  });
});

describe("splitAgentEnv", () => {
  it("partitions env vars into ConfigMap and Secret data by sensitivity", () => {
    const { configMapData, secretData } = splitAgentEnv([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "shh", sensitive: true },
    ]);
    expect(configMapData).toEqual({ REGION: "us-east-1" });
    expect(secretData).toEqual({ API_KEY: "shh" });
  });

  it("returns empty objects for undefined env", () => {
    expect(splitAgentEnv(undefined)).toEqual({ configMapData: {}, secretData: {} });
  });
});

describe("maskSensitiveEnv", () => {
  it("replaces sensitive values with the secret sentinel and leaves others untouched", () => {
    const masked = maskSensitiveEnv([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "shh", sensitive: true },
    ]);
    expect(masked).toEqual([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "<secret>", sensitive: true },
    ]);
  });

  it("passes through undefined", () => {
    expect(maskSensitiveEnv(undefined)).toBeUndefined();
  });
});

describe("hashAgentEnv", () => {
  it("is stable for equivalent env content regardless of order", () => {
    const a = hashAgentEnv([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "shh", sensitive: true },
    ]);
    const b = hashAgentEnv([
      { name: "API_KEY", value: "shh", sensitive: true },
      { name: "REGION", value: "us-east-1" },
    ]);
    expect(a).toBe(b);
  });

  it("changes when a value changes", () => {
    const a = hashAgentEnv([{ name: "REGION", value: "us-east-1" }]);
    const b = hashAgentEnv([{ name: "REGION", value: "us-west-2" }]);
    expect(a).not.toBe(b);
  });

  it("changes when a var is added or removed", () => {
    const a = hashAgentEnv([{ name: "REGION", value: "us-east-1" }]);
    const b = hashAgentEnv([
      { name: "REGION", value: "us-east-1" },
      { name: "API_KEY", value: "shh", sensitive: true },
    ]);
    expect(a).not.toBe(b);
  });

  it("is stable across undefined and empty array", () => {
    expect(hashAgentEnv(undefined)).toBe(hashAgentEnv([]));
  });
});

describe("agentToHermesAgent workspace.dotEnv wiring", () => {
  it("always sets both configMapRef and secretRef to the same agent-derived name", () => {
    const hermesAgent = agentToHermesAgent(makeAgent());
    expect(hermesAgent.spec.hermes?.workspace?.dotEnv).toEqual({
      configMapRef: { name: "agent-1-dot-env" },
      secretRef: { name: "agent-1-dot-env" },
    });
  });

  it("includes the SOUL.md file alongside dotEnv when soul is set", () => {
    const hermesAgent = agentToHermesAgent(makeAgent({ soul: "You are helpful." }));
    expect(hermesAgent.spec.hermes?.workspace?.files).toEqual({ "SOUL.md": "You are helpful." });
    expect(hermesAgent.spec.hermes?.workspace?.dotEnv).toEqual({
      configMapRef: { name: "agent-1-dot-env" },
      secretRef: { name: "agent-1-dot-env" },
    });
  });
});

describe("agentToHermesAgent packages wiring", () => {
  it("nests pip and npm install lists under the CR shape", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({ packages: { pip: ["requests", "pandas==2.1.0"], npm: ["typescript"] } })
    );
    expect(hermesAgent.spec.hermes?.packages).toEqual({
      pip: { install: ["requests", "pandas==2.1.0"] },
      npm: { install: ["typescript"] },
    });
  });

  it("omits pip/npm keys that are undefined", () => {
    const hermesAgent = agentToHermesAgent(makeAgent({ packages: { pip: ["requests"] } }));
    expect(hermesAgent.spec.hermes?.packages).toEqual({ pip: { install: ["requests"] } });
  });

  it("leaves packages undefined when not set on the agent", () => {
    const hermesAgent = agentToHermesAgent(makeAgent());
    expect(hermesAgent.spec.hermes?.packages).toBeUndefined();
  });

  it("round-trips through mapHermesAgent back to flat arrays", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({ packages: { pip: ["requests"], npm: ["typescript"] } })
    );
    const roundTripped = mapHermesAgent(hermesAgent);
    expect(roundTripped.packages).toEqual({ pip: ["requests"], npm: ["typescript"] });
  });
});

describe("agentToHermesAgent config.webhook wiring", () => {
  it("maps enabled and extra.port, and derives secretRef when enabled", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({ config: { platforms: { webhook: { enabled: true, extra: { port: 8644 } } } } })
    );
    expect(hermesAgent.spec.hermes?.config?.webhook).toEqual({
      enabled: true,
      port: 8644,
      secretRef: { name: "agent-1-dot-env", key: "WEBHOOK_SECRET" },
    });
  });

  it("omits secretRef when webhook is disabled", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({ config: { platforms: { webhook: { enabled: false } } } })
    );
    expect(hermesAgent.spec.hermes?.config?.webhook).toEqual({ enabled: false });
  });

  it("leaves config.webhook undefined when there's no platforms.webhook", () => {
    const hermesAgent = agentToHermesAgent(makeAgent({ config: { platforms: {} } }));
    expect(hermesAgent.spec.hermes?.config?.webhook).toBeUndefined();
    expect(hermesAgent.spec.hermes?.config?.raw).toEqual({ platforms: {} });
  });
});

describe("agentToHermesAgent config.apiServer wiring", () => {
  it("maps api_server fields, derives existingSecret when enabled, and strips it from raw", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({
        config: {
          model: { provider: "anthropic", default: "claude-sonnet-5" },
          api_server: { enabled: true, port: 8642, cors_origins: ["https://app.example.com"] },
        },
      })
    );
    expect(hermesAgent.spec.hermes?.config?.apiServer).toEqual({
      enabled: true,
      port: 8642,
      corsOrigins: ["https://app.example.com"],
      existingSecret: { name: "agent-1-dot-env", key: "API_SERVER_KEY" },
    });
    expect(hermesAgent.spec.hermes?.config?.raw).toEqual({
      model: { provider: "anthropic", default: "claude-sonnet-5" },
    });
  });

  it("omits existingSecret when the api server is disabled", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({ config: { api_server: { enabled: false } } })
    );
    expect(hermesAgent.spec.hermes?.config?.apiServer).toEqual({ enabled: false });
    expect(hermesAgent.spec.hermes?.config?.raw).toEqual({});
  });

  it("leaves config.apiServer undefined when there's no api_server", () => {
    const hermesAgent = agentToHermesAgent(makeAgent({ config: { platforms: {} } }));
    expect(hermesAgent.spec.hermes?.config?.apiServer).toBeUndefined();
    expect(hermesAgent.spec.hermes?.config?.raw).toEqual({ platforms: {} });
  });
});

describe("agentToHermesAgent spec.searxng wiring", () => {
  it("enables searxng and keeps web in raw when search_backend is searxng", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({ config: { web: { search_backend: "searxng", extract_backend: "firecrawl" } } })
    );
    expect(hermesAgent.spec.searxng).toEqual({ enabled: true });
    expect(hermesAgent.spec.hermes?.config?.raw).toEqual({
      web: { search_backend: "searxng", extract_backend: "firecrawl" },
    });
  });

  it("enables searxng when backend is searxng (single-backend form)", () => {
    const hermesAgent = agentToHermesAgent(makeAgent({ config: { web: { backend: "searxng" } } }));
    expect(hermesAgent.spec.searxng).toEqual({ enabled: true });
  });

  it("leaves searxng undefined for a non-searxng backend", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({ config: { web: { search_backend: "firecrawl" } } })
    );
    expect(hermesAgent.spec.searxng).toBeUndefined();
    expect(hermesAgent.spec.hermes?.config?.raw).toEqual({ web: { search_backend: "firecrawl" } });
  });

  it("leaves searxng undefined when web config is absent", () => {
    const hermesAgent = agentToHermesAgent(makeAgent());
    expect(hermesAgent.spec.searxng).toBeUndefined();
  });

  it("round-trips web config through the CR", () => {
    const config = { web: { search_backend: "searxng" as const } };
    const hermesAgent = agentToHermesAgent(makeAgent({ config }));
    expect(mapHermesConfig(hermesAgent.spec.hermes?.config)).toEqual(config);
  });
});

describe("agentToHermesAgent spec.camofox wiring", () => {
  it("enables camofox and keeps browser in raw when cloud_provider is camofox", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({ config: { browser: { cloud_provider: "camofox" } } })
    );
    expect(hermesAgent.spec.camofox).toEqual({ enabled: true });
    expect(hermesAgent.spec.hermes?.config?.raw).toEqual({
      browser: { cloud_provider: "camofox" },
    });
  });

  it("leaves camofox undefined for a non-camofox cloud provider", () => {
    const hermesAgent = agentToHermesAgent(
      makeAgent({ config: { browser: { cloud_provider: "browserbase" } } })
    );
    expect(hermesAgent.spec.camofox).toBeUndefined();
    expect(hermesAgent.spec.hermes?.config?.raw).toEqual({
      browser: { cloud_provider: "browserbase" },
    });
  });

  it("leaves camofox undefined when browser config is absent", () => {
    const hermesAgent = agentToHermesAgent(makeAgent());
    expect(hermesAgent.spec.camofox).toBeUndefined();
  });

  it("round-trips browser config through the CR", () => {
    const config = { browser: { cloud_provider: "camofox" as const } };
    const hermesAgent = agentToHermesAgent(makeAgent({ config }));
    expect(mapHermesConfig(hermesAgent.spec.hermes?.config)).toEqual(config);
  });
});

describe("mapHermesConfig", () => {
  it("folds apiServer back into config as snake_case api_server without existingSecret", () => {
    expect(
      mapHermesConfig({
        raw: { platforms: {} },
        apiServer: {
          enabled: true,
          port: 8642,
          corsOrigins: ["https://app.example.com"],
          existingSecret: { name: "agent-1-dot-env", key: "API_SERVER_KEY" },
        },
      })
    ).toEqual({
      platforms: {},
      api_server: { enabled: true, port: 8642, cors_origins: ["https://app.example.com"] },
    });
  });

  it("returns raw unchanged when apiServer is absent", () => {
    expect(mapHermesConfig({ raw: { platforms: {} } })).toEqual({ platforms: {} });
    expect(mapHermesConfig(undefined)).toBeUndefined();
  });

  it("round-trips an agent config through the CR", () => {
    const config = {
      model: { provider: "anthropic", default: "claude-sonnet-5" },
      api_server: { enabled: true, port: 8642 },
    };
    const hermesAgent = agentToHermesAgent(makeAgent({ config }));
    expect(mapHermesConfig(hermesAgent.spec.hermes?.config)).toEqual(config);
  });
});

describe("agentToHermesAgent crons wiring", () => {
  it("maps agent.crons straight onto hermes.crons", () => {
    const crons = [
      {
        name: "daily-standup",
        schedule: "0 9 * * *",
        prompt: "Summarize yesterday's activity.",
        deliver: "slack" as const,
        repeat: 3,
        skills: ["standup-summarizer"],
      },
    ];
    const hermesAgent = agentToHermesAgent(makeAgent({ crons }));
    expect(hermesAgent.spec.hermes?.crons).toEqual(crons);
  });

  it("leaves hermes.crons undefined when agent.crons is undefined", () => {
    const hermesAgent = agentToHermesAgent(makeAgent());
    expect(hermesAgent.spec.hermes?.crons).toBeUndefined();
  });
});

describe("mapHermesAgent crons round-trip", () => {
  function makeRawAgent(crons: unknown): HermesAgent {
    return {
      spec: { hermes: { crons } },
    } as unknown as HermesAgent;
  }

  it("round-trips supported fields", () => {
    const crons = [
      {
        name: "daily-standup",
        schedule: "0 9 * * *",
        prompt: "Summarize yesterday's activity.",
        deliver: "slack",
        repeat: 3,
        skills: ["standup-summarizer"],
      },
    ];
    const agent = mapHermesAgent(makeRawAgent(crons));
    expect(agent.crons).toEqual(crons);
  });

  it("strips unsupported HermesCron fields (script, noAgent, workdir, profile)", () => {
    const rawCrons = [
      {
        name: "cleanup",
        schedule: "0 0 * * *",
        prompt: "Clean up temp files.",
        script: "rm -rf /tmp/*",
        noAgent: true,
        workdir: "/tmp",
        profile: "default",
      },
    ];
    const agent = mapHermesAgent(makeRawAgent(rawCrons));
    expect(agent.crons).toEqual([
      { name: "cleanup", schedule: "0 0 * * *", prompt: "Clean up temp files." },
    ]);
  });

  it("returns undefined when there are no crons", () => {
    const agent = mapHermesAgent(makeRawAgent(undefined));
    expect(agent.crons).toBeUndefined();
  });
});

describe("agentToHermesAgent podAnnotations wiring", () => {
  it("stamps an env-hash annotation derived from agent.env", () => {
    const env = [{ name: "REGION", value: "us-east-1" }];
    const hermesAgent = agentToHermesAgent(makeAgent({ env }));
    expect(hermesAgent.spec.podAnnotations).toEqual({ "hermeum.app/env-hash": hashAgentEnv(env) });
  });

  it("changes the annotation when env content changes", () => {
    const a = agentToHermesAgent(makeAgent({ env: [{ name: "REGION", value: "us-east-1" }] }));
    const b = agentToHermesAgent(makeAgent({ env: [{ name: "REGION", value: "us-west-2" }] }));
    expect(a.spec.podAnnotations).not.toEqual(b.spec.podAnnotations);
  });
});
