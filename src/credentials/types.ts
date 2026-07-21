import type { TeamId } from "../domain/team-id.js";
import type { CredentialKind, CredentialSecret } from "./secret.js";

export type CredentialRequirement = {
  requiredKinds: readonly CredentialKind[];
  requiredScopes?: Partial<Record<CredentialKind, readonly string[]>>;
  operation?: string;
};

export class VerifiedCredential {
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

export type VerifiedCredentialSet = {
  readonly teamId: TeamId;
  readonly user?: VerifiedCredential;
  readonly bot?: VerifiedCredential;
  readonly requiredScopes: Partial<Record<CredentialKind, readonly string[]>>;
};
