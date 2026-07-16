import * as fs from "node:fs/promises";
import * as path from "node:path";

import { DocumentAdaptor, DocumentMeta } from "../usecases/adaptors/document";

const DOCUMENT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class LocalDocuments implements DocumentAdaptor {
  constructor(private readonly dirPath: string = "./docs/agent-config") {}

  async list(): Promise<DocumentMeta[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.dirPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }

    const names = entries.filter((e) => e.endsWith(".md")).map((e) => e.slice(0, -".md".length));
    return Promise.all(
      names.map(async (name) => ({
        name,
        description: firstLine((await this.read(name)) ?? ""),
      }))
    );
  }

  async read(name: string): Promise<string | null> {
    // Only simple slugs are valid names — rules out path traversal ("..", "/").
    if (!DOCUMENT_NAME_RE.test(name) || name.includes("..")) {
      return null;
    }

    try {
      return await fs.readFile(path.join(this.dirPath, `${name}.md`), "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }
}

// First non-empty line, stripped of markdown heading markers.
function firstLine(content: string): string {
  for (const line of content.split("\n")) {
    const stripped = line.replace(/^#+\s*/, "").trim();
    if (stripped.length > 0) {
      return stripped;
    }
  }
  return "";
}
