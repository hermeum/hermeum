export type File = {
  /** Full path of the file, e.g. "docs/official/model.md". */
  path: string;
  /**
   * Name of the file relative to the listed directory, without extension
   * (e.g. "model" or "examples/github-issue"). readFile keeps the basename.
   */
  name: string;
  /** File body; for markdown, without the frontmatter block. */
  content: string;
  /** Parsed markdown frontmatter; empty for other file types. */
  data: Record<string, unknown>;
};

export interface FileAdaptor {
  /** Lists and loads every file under the directory, recursively. Missing directory → []. */
  listFiles(path: string): Promise<File[]>;
  /** Returns the file, or null if it does not exist. */
  readFile(path: string): Promise<File | null>;
}
