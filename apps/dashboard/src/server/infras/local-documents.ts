import * as fs from "node:fs/promises";
import * as path from "node:path";

import matter from "gray-matter";

import { DocumentAdaptor, File } from "../usecases/adaptors/document";

const DOCUMENT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class LocalDocuments implements DocumentAdaptor {
  constructor(private readonly dirPath: string = "./docs/agent-config") {}

  async list(): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.dirPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }

    return entries.filter((e) => e.endsWith(".md")).map((e) => e.slice(0, -".md".length));
  }

  async read(name: string): Promise<File | null> {
    // Only simple slugs are valid names — rules out path traversal ("..", "/").
    if (!DOCUMENT_NAME_RE.test(name) || name.includes("..")) {
      return null;
    }

    let raw: string;
    try {
      raw = await fs.readFile(path.join(this.dirPath, `${name}.md`), "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }

    const { content, data } = matter(raw);
    return { content, data };
  }
}
