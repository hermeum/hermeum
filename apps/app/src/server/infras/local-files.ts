import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
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

    const walk = async (prefix: string, dirents: Dirent[]): Promise<File[]> => {
      const nested = await Promise.all(
        dirents.map(async (e) => {
          if (e.isFile()) {
            const file = await this.readFile(path.join(dirPath, prefix + e.name));
            const relativeName = prefix + path.basename(e.name, path.extname(e.name));
            return file === null ? null : { ...file, name: relativeName };
          }
          if (e.isDirectory()) {
            const children = await fs.readdir(path.join(dirPath, prefix + e.name), {
              withFileTypes: true,
            });
            return walk(`${prefix}${e.name}/`, children);
          }
          return [];
        })
      );
      return nested.flat().filter((f): f is File => f !== null);
    };

    return walk("", entries);
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
