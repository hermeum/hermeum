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

  it("leaves pluginRef unset when HERMEUM_PLUGIN_REF is absent or empty", () => {
    expect(ConfigSchema.parse({ databaseUrl: "file:./test.sqlite" }).pluginRef).toBeUndefined();
    expect(
      ConfigSchema.parse({ databaseUrl: "file:./test.sqlite", pluginRef: "" }).pluginRef
    ).toBeUndefined();
  });

  it("rejects a pluginRef that is not a full 40-character SHA", () => {
    expect(() =>
      ConfigSchema.parse({ databaseUrl: "file:./test.sqlite", pluginRef: "v1.2.3" })
    ).toThrow(/pluginRef must be a full 40-character Git commit SHA/);
  });
});
