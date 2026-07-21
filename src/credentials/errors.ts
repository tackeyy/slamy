export type CredentialErrorCode =
  | "AUTH_IDENTITY_INVALID"
  | "AUTH_VERIFICATION_FAILED"
  | "BOT_IDENTITY_REQUIRED"
  | "CREDENTIAL_DESTROYED"
  | "CREDENTIAL_PROVIDER_FAILED"
  | "CROSS_TEAM_CREDENTIALS"
  | "INVALID_CREDENTIAL_REQUIREMENT"
  | "REQUIRED_CREDENTIAL_MISSING"
  | "TEAM_ID_MISMATCH"
  | "TOKEN_KIND_MISMATCH"
  | "UNKNOWN_CREDENTIAL_PROVIDER"
  | "UNSUPPORTED_TOKEN_KIND";

export class CredentialError extends Error {
  readonly code: CredentialErrorCode;

  constructor(code: CredentialErrorCode, message: string) {
    super(message);
    this.name = "CredentialError";
    this.code = code;
  }

  toJSON(): { name: string; code: CredentialErrorCode; message: string } {
    return { name: this.name, code: this.code, message: this.message };
  }
}
