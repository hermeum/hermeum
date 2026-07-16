import * as fs from "node:fs/promises";
import * as path from "node:path";

import matter from "gray-matter";

import { File, FileAdaptor } from "../usecases/adaptors/file";

export class LocalFiles implements FileAdaptor {
  async listFiles(dirPath: string): Promise<File[]> {
    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }

    const files = await Promise.all(
      entries.filter((e) => e.isFile()).map((e) => this.readFile(path.join(dirPath, e.name)))
    );
    return files.filter((f) => f !== null);
  }

  async readFile(filePath: string): Promise<File | null> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }

    const name = path.basename(filePath, path.extname(filePath));
    // Only markdown gets frontmatter treatment: a YAML file starting with
    // "---" must not be mistaken for a frontmatter block.
    if (path.extname(filePath) !== ".md") {
      return { path: filePath, name, content: raw, data: {} };
    }
    const { content, data } = matter(raw);
    return { path: filePath, name, content, data };
  }
}
