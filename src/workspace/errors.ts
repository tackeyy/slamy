export type WorkspaceRegistryErrorCode =
  | "INVALID_CONFIG"
  | "UNSUPPORTED_VERSION"
  | "DUPLICATE_TEAM_ID"
  | "DUPLICATE_ALIAS"
  | "DUPLICATE_DOMAIN"
  | "DEFAULT_NOT_FOUND"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_EXISTS"
  | "UNSAFE_CONFIG"
  | "STORE_WRITE_FAILED";

export class WorkspaceRegistryError extends Error {
  readonly code: WorkspaceRegistryErrorCode;

  constructor(code: WorkspaceRegistryErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceRegistryError";
    this.code = code;
  }
}
