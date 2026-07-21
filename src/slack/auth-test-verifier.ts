import { LogLevel, WebClient } from "@slack/web-api";
import { parseTeamId } from "../domain/team-id.js";
import type {
  AuthIdentity,
  AuthVerifier,
  CredentialHandle,
} from "../credentials/auth-verifier.js";
import { CredentialError } from "../credentials/errors.js";

type AuthTestResponse = {
  ok?: boolean;
  team_id?: string;
  user_id?: string;
  bot_id?: string;
  enterprise_id?: string;
};

type AuthTestClient = {
  auth: {
    test(): Promise<AuthTestResponse>;
  };
};

type AuthTestClientFactory = (token: string) => AuthTestClient;

export class SlackAuthTestVerifier implements AuthVerifier {
  readonly #createClient: AuthTestClientFactory;

  constructor(
    createClient: AuthTestClientFactory = (token) =>
      new WebClient(token, { logLevel: LogLevel.WARN }) as AuthTestClient,
  ) {
    this.#createClient = createClient;
  }

  async verify(secret: CredentialHandle): Promise<AuthIdentity> {
    let response: AuthTestResponse;
    try {
      const client = secret.use((token) => this.#createClient(token));
      response = await client.auth.test();
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
