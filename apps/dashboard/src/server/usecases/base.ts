import { LocalFiles } from "../infras/local-files";
import { FileAdaptor } from "./adaptors/file";

// Core base class for use cases that read local files; mixins like
// HermeumConfigLoadable build on the injected adaptor.
export class FilesUseCase {
  constructor(readonly files: FileAdaptor = new LocalFiles()) {}
}
