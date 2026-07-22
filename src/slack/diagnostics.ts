import type { CredentialKind } from "../credentials/types.js";
import type { TeamId } from "../domain/team-id.js";
import type { SlackAdapterErrorCode } from "./errors.js";
import type { SlackApiMethod } from "./method-policy.js";

export type SlackDiagnosticEvent = {
  readonly requestId: string;
  readonly method: SlackApiMethod;
  readonly teamId: TeamId;
  readonly credentialKind: CredentialKind;
  readonly outcome: "started" | "succeeded" | "failed";
  readonly errorCode?: SlackAdapterErrorCode;
};

export type SlackDiagnosticSink = (event: SlackDiagnosticEvent) => void;
export type SlackRequestIdFactory = () => string;

export function createLocalRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export function validateRequestId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !/^[A-Za-z0-9._-]+$/.test(value)
  ) {
    throw new TypeError("Invalid request ID");
  }
  return value;
}

export function emitDiagnostic(
  sink: SlackDiagnosticSink | undefined,
  event: SlackDiagnosticEvent,
): void {
  if (!sink) return;
  try {
    sink(Object.freeze({ ...event }));
  } catch {
    // Diagnostics are observational and must not change operation behavior.
  }
}
