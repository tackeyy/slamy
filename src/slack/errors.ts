import type { CredentialKind } from "../credentials/types.js";
import type { TeamId } from "../domain/team-id.js";
import type { SlackApiMethod } from "./method-policy.js";

export type SlackAdapterErrorCode =
  | "CREDENTIAL_SCOPE_CONTRACT_MISMATCH"
  | "CREDENTIAL_UNAVAILABLE"
  | "INVALID_REQUEST_ID"
  | "INVALID_SLACK_INPUT"
  | "INVALID_SLACK_RESPONSE"
  | "PAGINATION_INVALID"
  | "SLACK_HTTP_ERROR"
  | "SLACK_PLATFORM_ERROR"
  | "SLACK_RATE_LIMITED"
  | "SLACK_REQUEST_ERROR"
  | "WORKSPACE_CONTEXT_MISMATCH"
  | "WORKSPACE_VERIFICATION_FAILED";

export type SlackAdapterErrorDetails = {
  code: SlackAdapterErrorCode;
  message: string;
  requestId: string;
  method: SlackApiMethod;
  teamId: TeamId;
  credentialKind: CredentialKind;
  platformCode?: string;
  retryAfterSeconds?: number;
};

export class SlackAdapterError extends Error {
  readonly code: SlackAdapterErrorCode;
  readonly requestId: string;
  readonly method: SlackApiMethod;
  readonly teamId: TeamId;
  readonly credentialKind: CredentialKind;
  readonly platformCode?: string;
  readonly retryAfterSeconds?: number;

  constructor(details: SlackAdapterErrorDetails) {
    super(details.message);
    this.name = "SlackAdapterError";
    this.code = details.code;
    this.requestId = details.requestId;
    this.method = details.method;
    this.teamId = details.teamId;
    this.credentialKind = details.credentialKind;
    if (details.platformCode !== undefined) this.platformCode = details.platformCode;
    if (details.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = details.retryAfterSeconds;
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      method: this.method,
      teamId: this.teamId,
      credentialKind: this.credentialKind,
      ...(this.platformCode === undefined ? {} : { platformCode: this.platformCode }),
      ...(this.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: this.retryAfterSeconds }),
    };
  }
}
