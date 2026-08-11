import type { TeamId } from "../domain/team-id.js";
import type { CredentialKind } from "./types.js";

export interface CredentialHandle {
  readonly kind: CredentialKind;
  use<Result>(consumer: (value: string) => Result): Result;
}

export type AuthIdentity = {
  teamId: TeamId;
  userId?: string;
  botId?: string;
  enterpriseId?: string;
};

export interface AuthVerifier {
  verify(secret: CredentialHandle): Promise<AuthIdentity>;
}
