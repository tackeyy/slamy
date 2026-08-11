import type { WorkspaceRegistryDocument } from "./types.js";

export interface WorkspaceStore {
  read(): Promise<WorkspaceRegistryDocument>;
  write(document: WorkspaceRegistryDocument): Promise<void>;
  update(
    mutate: (document: WorkspaceRegistryDocument) => WorkspaceRegistryDocument,
  ): Promise<WorkspaceRegistryDocument>;
}
