import { describe, it, expect } from "vitest";

import { ConfigSchema } from "@/server/libs/config";

describe("ConfigSchema plugin endpoint derivation", () => {
  it("derives pluginEndpointUrl by appending the /plugin/trpc mount prefix", () => {
    const parsed = ConfigSchema.parse({
      databaseUrl: "file:./test.sqlite",
      pluginBaseUrl: "http://localhost:3000",
    });
    expect(parsed.pluginEndpointUrl).toBe("http://localhost:3000/plugin/trpc");
  });

  it("trims a trailing slash from pluginBaseUrl before appending", () => {
    const parsed = ConfigSchema.parse({
      databaseUrl: "file:./test.sqlite",
      pluginBaseUrl: "http://hermeum:3000/",
    });
    expect(parsed.pluginEndpointUrl).toBe("http://hermeum:3000/plugin/trpc");
  });

  it("falls back to the http://hermeum:3000 default base URL", () => {
    const parsed = ConfigSchema.parse({ databaseUrl: "file:./test.sqlite" });
    expect(parsed.pluginBaseUrl).toBe("http://hermeum:3000");
    expect(parsed.pluginEndpointUrl).toBe("http://hermeum:3000/plugin/trpc");
  });

  it("pins pluginIdentifier to the plugins/hermeum install identifier", () => {
    const parsed = ConfigSchema.parse({ databaseUrl: "file:./test.sqlite" });
    expect(parsed.pluginIdentifier).toBe("hermeum/hermeum/plugins/hermeum");
  });

  it("pins pluginRef to the plugins/hermeum install commit pin", () => {
    const parsed = ConfigSchema.parse({ databaseUrl: "file:./test.sqlite" });
    expect(parsed.pluginRef).toBe(
      "fe9e5350054cccaf3a38d49b70900d4300b90462",
    );
    expect(parsed.pluginRef).toMatch(/^[0-9a-f]{40}$/);
  });
});
