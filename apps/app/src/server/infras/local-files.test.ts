import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { LocalFiles } from "./local-files";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-files-"));
  fs.writeFileSync(
    path.join(dir, "model.md"),
    "---\ndescription: Model configuration\n---\n# Model\n\nDetails.\n"
  );
  fs.writeFileSync(path.join(dir, "webhook.md"), "Webhook routes explained.\n");
  // "---" here is a YAML document separator, not frontmatter.
  fs.writeFileSync(path.join(dir, "config.yaml"), "---\nkey: value\n");
  fs.mkdirSync(path.join(dir, "subdir"));
  fs.mkdirSync(path.join(dir, "examples"));
  fs.writeFileSync(
    path.join(dir, "examples", "github-issue.md"),
    "---\ndescription: GitHub issue example\n---\n# GitHub issue\n\nDetails.\n"
  );
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("LocalFiles.listFiles", () => {
  it("lists loaded files, skipping empty directories", async () => {
    const files = await new LocalFiles().listFiles(dir);

    expect(files).toEqual(
      expect.arrayContaining([
        {
          path: path.join(dir, "model.md"),
          name: "model",
          content: "# Model\n\nDetails.\n",
          data: { description: "Model configuration" },
        },
        {
          path: path.join(dir, "webhook.md"),
          name: "webhook",
          content: "Webhook routes explained.\n",
          data: {},
        },
        {
          path: path.join(dir, "config.yaml"),
          name: "config",
          content: "---\nkey: value\n",
          data: {},
        },
      ])
    );
    expect(files).toHaveLength(4);
  });

  it("lists nested files recursively with slash-relative names", async () => {
    const files = await new LocalFiles().listFiles(dir);

    const nested = files.find((f) => f.name === "examples/github-issue");
    expect(nested).toEqual({
      path: path.join(dir, "examples", "github-issue.md"),
      name: "examples/github-issue",
      content: "# GitHub issue\n\nDetails.\n",
      data: { description: "GitHub issue example" },
    });
  });

  it("returns an empty list for a missing directory", async () => {
    const files = await new LocalFiles().listFiles(path.join(dir, "does-not-exist"));

    expect(files).toEqual([]);
  });
});

describe("LocalFiles.readFile", () => {
  it("splits markdown frontmatter into data", async () => {
    const file = await new LocalFiles().readFile(path.join(dir, "model.md"));

    expect(file).toEqual({
      path: path.join(dir, "model.md"),
      name: "model",
      content: "# Model\n\nDetails.\n",
      data: { description: "Model configuration" },
    });
  });

  it("returns markdown without frontmatter as-is with empty data", async () => {
    const file = await new LocalFiles().readFile(path.join(dir, "webhook.md"));

    expect(file).toEqual({
      path: path.join(dir, "webhook.md"),
      name: "webhook",
      content: "Webhook routes explained.\n",
      data: {},
    });
  });

  it("does not treat a leading YAML document separator as frontmatter", async () => {
    const file = await new LocalFiles().readFile(path.join(dir, "config.yaml"));

    expect(file).toEqual({
      path: path.join(dir, "config.yaml"),
      name: "config",
      content: "---\nkey: value\n",
      data: {},
    });
  });

  it("returns null for a missing file", async () => {
    const file = await new LocalFiles().readFile(path.join(dir, "nope.md"));

    expect(file).toBeNull();
  });
});
