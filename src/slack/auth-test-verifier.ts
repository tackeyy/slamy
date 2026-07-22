import { parseTeamId } from "../domain/team-id.js";
import type {
  AuthIdentity,
  AuthVerifier,
  CredentialHandle,
} from "../credentials/auth-verifier.js";
import { CredentialError } from "../credentials/errors.js";
import type { SlackAuthTestTransport } from "./transport.js";
import { NodeSlackWebApiTransport } from "./web-api-transport.js";

type AuthTestResponse = {
  ok?: boolean;
  team_id?: string;
  user_id?: string;
  bot_id?: string;
  enterprise_id?: string;
};

export class SlackAuthTestVerifier implements AuthVerifier {
  readonly #transport: SlackAuthTestTransport;

  constructor(transport: SlackAuthTestTransport = new NodeSlackWebApiTransport()) {
    this.#transport = transport;
  }

  async verify(secret: CredentialHandle): Promise<AuthIdentity> {
    let response: AuthTestResponse;
    try {
      response = (await secret.use((token) => this.#transport.authTest(token))) as AuthTestResponse;
    } catch {
      throw new CredentialError(
        "AUTH_VERIFICATION_FAILED",
        "Slack credential identity verification failed",
      );
    }

    if (response.ok !== true) {
      throw new CredentialError(
        "AUTH_VERIFICATION_FAILED",
        "Slack rejected credential identity verification",
      );
    }

    let teamId;
    try {
      if (!response.team_id) throw new Error("missing Team ID");
      teamId = parseTeamId(response.team_id);
    } catch {
      throw new CredentialError(
        "AUTH_IDENTITY_INVALID",
        "Slack authentication identity did not contain a valid Team ID",
      );
    }

    return {
      teamId,
      ...(response.user_id ? { userId: response.user_id } : {}),
      ...(response.bot_id ? { botId: response.bot_id } : {}),
      ...(response.enterprise_id ? { enterpriseId: response.enterprise_id } : {}),
    };
  }
}
