export type TargetErrorCode =
  | "AMBIGUOUS_QUERY"
  | "CHANNEL_CONFLICT"
  | "INVALID_CHANNEL_ID"
  | "INVALID_TARGET"
  | "INVALID_TIMESTAMP"
  | "INVALID_URL_ENCODING"
  | "TIMESTAMP_CONFLICT"
  | "UNSUPPORTED_URL"
  | "DEFAULT_NOT_FOUND"
  | "ENTERPRISE_CONTEXT_AMBIGUOUS"
  | "WORKSPACE_AMBIGUOUS"
  | "WORKSPACE_CONFLICT"
  | "WORKSPACE_NOT_REGISTERED";

export class TargetError extends Error {
  readonly code: TargetErrorCode;

  constructor(code: TargetErrorCode, message: string) {
    super(message);
    this.name = "TargetError";
    this.code = code;
  }

  toJSON(): { name: string; code: TargetErrorCode; message: string } {
    return { name: this.name, code: this.code, message: this.message };
  }
}
