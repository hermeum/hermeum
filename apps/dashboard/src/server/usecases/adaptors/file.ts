export type File = {
  /** Full path of the file, e.g. "docs/hermes-config/model.md". */
  path: string;
  /** Base file name without extension, e.g. "model". */
  name: string;
  /** File body; for markdown, without the frontmatter block. */
  content: string;
  /** Parsed markdown frontmatter; empty for other file types. */
  data: Record<string, unknown>;
};

export interface FileAdaptor {
  /** Lists and loads every file directly inside the directory. Missing directory → []. */
  listFiles(path: string): Promise<File[]>;
  /** Returns the file, or null if it does not exist. */
  readFile(path: string): Promise<File | null>;
}
