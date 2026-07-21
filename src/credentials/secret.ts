import { inspect } from "node:util";
import { CredentialError } from "./errors.js";

export type CredentialKind = "user" | "bot";

export class CredentialSecret {
  readonly kind: CredentialKind;
  #value: string | undefined;

  constructor(value: string, kind: CredentialKind) {
    const actualKind = classifyCredentialKind(value);
    if (actualKind !== kind) {
      throw new CredentialError(
        "TOKEN_KIND_MISMATCH",
        "Credential token kind does not match its configured slot",
      );
    }
    this.kind = kind;
    this.#value = value;
  }

  use<Result>(consumer: (value: string) => Result): Result {
    if (this.#value === undefined) {
      throw new CredentialError("CREDENTIAL_DESTROYED", "Credential is no longer available");
    }
    return consumer(this.#value);
  }

  destroy(): void {
    this.#value = undefined;
  }

  toString(): string {
    return "[REDACTED]";
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  [inspect.custom](): string {
    return "[REDACTED]";
  }
}

export function createCredentialSecret(value: string, kind: CredentialKind): CredentialSecret {
  return new CredentialSecret(value, kind);
}

function classifyCredentialKind(value: string): CredentialKind {
  if (value.startsWith("xoxp-") || value.startsWith("xoxe.xoxp-")) return "user";
  if (value.startsWith("xoxb-") || value.startsWith("xoxe.xoxb-")) return "bot";
  throw new CredentialError("UNSUPPORTED_TOKEN_KIND", "Credential token kind is unsupported");
}
