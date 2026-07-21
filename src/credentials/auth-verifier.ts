import type { TeamId } from "../domain/team-id.js";
import type { CredentialSecret } from "./secret.js";

export type AuthIdentity = {
  teamId: TeamId;
  userId?: string;
  botId?: string;
  enterpriseId?: string;
};

export interface AuthVerifier {
  verify(secret: CredentialSecret): Promise<AuthIdentity>;
}
