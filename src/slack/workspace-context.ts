import type { VerifiedCredentialSet } from "../credentials/types.js";
import { parseTeamId, type TeamId } from "../domain/team-id.js";
import { SlackAdapterError } from "./errors.js";

const UNKNOWN_TEAM_ID = parseTeamId("TUNKNOWN");

export type SlackWorkspaceContext = {
  readonly teamId: TeamId;
  readonly credentials: VerifiedCredentialSet;
};

export type CreateSlackWorkspaceContextInput = {
  teamId: TeamId;
  credentials: VerifiedCredentialSet;
};

export function createSlackWorkspaceContext(
  input: CreateSlackWorkspaceContextInput,
): SlackWorkspaceContext {
  let teamId = UNKNOWN_TEAM_ID;
  try {
    teamId = parseTeamId(input.teamId);
    const credentials = input.credentials;
    const credentialTeamId = parseTeamId(credentials.teamId);
    const user = credentials.user;
    const bot = credentials.bot;
    if (
      credentialTeamId !== teamId ||
      (user !== undefined &&
        (user.kind !== "user" || parseTeamId(user.teamId) !== teamId)) ||
      (bot !== undefined &&
        (bot.kind !== "bot" || parseTeamId(bot.teamId) !== teamId))
    ) {
      throw new TypeError();
    }
    return Object.freeze({ teamId, credentials });
  } catch {
    throw mismatch(teamId);
  }
}

function mismatch(teamId: TeamId): SlackAdapterError {
  return new SlackAdapterError({
    code: "WORKSPACE_CONTEXT_MISMATCH",
    message: "Slack workspace context does not match its verified credentials",
    requestId: "unavailable",
    method: "auth.test",
    teamId,
    credentialKind: "user",
  });
}
