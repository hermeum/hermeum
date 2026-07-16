import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { LocalDocuments } from "./local-documents";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-documents-"));
  fs.writeFileSync(
    path.join(dir, "model.md"),
    "---\ndescription: Model configuration\n---\n# Model\n\nDetails.\n"
  );
  fs.writeFileSync(path.join(dir, "webhook.md"), "Webhook routes explained.\n");
  fs.writeFileSync(path.join(dir, "notes.txt"), "not a document");
  fs.writeFileSync(path.join(dir, "secret.yaml"), "key: value");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("LocalDocuments.list", () => {
  it("lists .md file names without the extension", async () => {
    const docs = await new LocalDocuments(dir).list();

    expect(docs).toEqual(expect.arrayContaining(["model", "webhook"]));
    expect(docs).toHaveLength(2);
  });

  it("returns an empty list for a missing directory", async () => {
    const docs = await new LocalDocuments(path.join(dir, "does-not-exist")).list();

    expect(docs).toEqual([]);
  });
});

describe("LocalDocuments.read", () => {
  it("reads a document by name, splitting frontmatter data from content", async () => {
    const file = await new LocalDocuments(dir).read("model");

    expect(file).toEqual({
      content: "# Model\n\nDetails.\n",
      data: { description: "Model configuration" },
    });
  });

  it("returns empty data for a document without frontmatter", async () => {
    const file = await new LocalDocuments(dir).read("webhook");

    expect(file).toEqual({ content: "Webhook routes explained.\n", data: {} });
  });

  it("returns null for a missing document", async () => {
    const file = await new LocalDocuments(dir).read("nope");

    expect(file).toBeNull();
  });

  it("rejects path traversal and non-slug names", async () => {
    const documents = new LocalDocuments(dir);

    expect(await documents.read("../local-documents.test")).toBeNull();
    expect(await documents.read("sub/model")).toBeNull();
    expect(await documents.read(".hidden")).toBeNull();
    expect(await documents.read("")).toBeNull();
  });
});
