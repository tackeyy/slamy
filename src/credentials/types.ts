import type { TeamId } from "../domain/team-id.js";

export type CredentialKind = "user" | "bot";

export type CredentialRequirement = {
  requiredKinds: readonly CredentialKind[];
  requiredScopes?: Partial<Record<CredentialKind, readonly string[]>>;
  operation?: string;
};

export interface VerifiedCredential {
  readonly kind: CredentialKind;
  readonly teamId: TeamId;
  use<Result>(consumer: (token: string) => Result): Result;
  destroy(): void;
}

export type VerifiedCredentialSet = {
  readonly teamId: TeamId;
  readonly user?: VerifiedCredential;
  readonly bot?: VerifiedCredential;
  readonly requiredScopes: Partial<Record<CredentialKind, readonly string[]>>;
};
