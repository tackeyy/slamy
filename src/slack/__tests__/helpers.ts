import { parseTeamId, type TeamId } from "../../domain/team-id.js";
import type {
  CredentialKind,
  VerifiedCredential,
  VerifiedCredentialSet,
} from "../../credentials/types.js";
import { createSlackWorkspaceContext } from "../workspace-context.js";

export const PRIMARY_TEAM_ID = parseTeamId("T00000001");

export function contextWith(options: {
  teamId?: TeamId;
  userToken?: string;
  botToken?: string;
  userScopes?: readonly string[];
  botScopes?: readonly string[];
}) {
  const teamId = options.teamId ?? PRIMARY_TEAM_ID;
  const set: VerifiedCredentialSet = Object.freeze({
    teamId,
    ...(options.userToken
      ? { user: credential("user", teamId, options.userToken) }
      : {}),
    ...(options.botToken ? { bot: credential("bot", teamId, options.botToken) } : {}),
    requiredScopes: Object.freeze({
      ...(options.userScopes ? { user: Object.freeze([...options.userScopes]) } : {}),
      ...(options.botScopes ? { bot: Object.freeze([...options.botScopes]) } : {}),
    }),
    destroy() {},
  });
  return createSlackWorkspaceContext({ teamId, credentials: set });
}

function credential(kind: CredentialKind, teamId: TeamId, token: string): VerifiedCredential {
  return Object.freeze({
    kind,
    teamId,
    use<Result>(consumer: (value: string) => Result): Result {
      return consumer(token);
    },
    destroy() {},
  });
}
