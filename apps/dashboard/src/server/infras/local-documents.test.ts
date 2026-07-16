import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { LocalDocuments } from "./local-documents";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-documents-"));
  fs.writeFileSync(path.join(dir, "model.md"), "# Model configuration\n\nDetails.\n");
  fs.writeFileSync(path.join(dir, "webhook.md"), "\n\nWebhook routes explained.\n");
  fs.writeFileSync(path.join(dir, "notes.txt"), "not a document");
  fs.writeFileSync(path.join(dir, "secret.yaml"), "key: value");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("LocalDocuments.list", () => {
  it("lists .md files with the first non-empty line as description", async () => {
    const docs = await new LocalDocuments(dir).list();

    expect(docs).toEqual(
      expect.arrayContaining([
        { name: "model", description: "Model configuration" },
        { name: "webhook", description: "Webhook routes explained." },
      ])
    );
    expect(docs).toHaveLength(2);
  });

  it("returns an empty list for a missing directory", async () => {
    const docs = await new LocalDocuments(path.join(dir, "does-not-exist")).list();

    expect(docs).toEqual([]);
  });
});

describe("LocalDocuments.read", () => {
  it("reads a document by name", async () => {
    const content = await new LocalDocuments(dir).read("model");

    expect(content).toBe("# Model configuration\n\nDetails.\n");
  });

  it("returns null for a missing document", async () => {
    const content = await new LocalDocuments(dir).read("nope");

    expect(content).toBeNull();
  });

  it("rejects path traversal and non-slug names", async () => {
    const documents = new LocalDocuments(dir);

    expect(await documents.read("../local-documents.test")).toBeNull();
    expect(await documents.read("sub/model")).toBeNull();
    expect(await documents.read(".hidden")).toBeNull();
    expect(await documents.read("")).toBeNull();
  });
});
