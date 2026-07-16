export type File = {
  /** Document body, without the frontmatter block. */
  content: string;
  /** Parsed frontmatter data. */
  data: Record<string, unknown>;
};

export interface DocumentAdaptor {
  /** Returns the available document names (file names without extension). */
  list(): Promise<string[]>;
  /** Returns the document, or null if no such document exists. */
  read(name: string): Promise<File | null>;
}
