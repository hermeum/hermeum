export type DocumentMeta = { name: string; description: string };

export interface DocumentAdaptor {
  list(): Promise<DocumentMeta[]>;
  /** Returns the document content, or null if no such document exists. */
  read(name: string): Promise<string | null>;
}
