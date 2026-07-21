import type { TeamId } from "../domain/team-id.js";
import type { CredentialSecret } from "./secret.js";
import type { CredentialKind, VerifiedCredential } from "./types.js";

class VerifiedCredentialValue implements VerifiedCredential {
  readonly kind: CredentialKind;
  readonly teamId: TeamId;
  readonly #secret: CredentialSecret;

  constructor(kind: CredentialKind, teamId: TeamId, secret: CredentialSecret) {
    this.kind = kind;
    this.teamId = teamId;
    this.#secret = secret;
  }

  use<Result>(consumer: (token: string) => Result): Result {
    return this.#secret.use(consumer);
  }

  destroy(): void {
    this.#secret.destroy();
  }

  toJSON(): { kind: CredentialKind; teamId: TeamId; token: "[REDACTED]" } {
    return { kind: this.kind, teamId: this.teamId, token: "[REDACTED]" };
  }
}

export function createVerifiedCredential(
  kind: CredentialKind,
  teamId: TeamId,
  secret: CredentialSecret,
): VerifiedCredential {
  return new VerifiedCredentialValue(kind, teamId, secret);
}
