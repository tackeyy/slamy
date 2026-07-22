import type { VerifiedCredentialSet } from "../credentials/types.js";
import type { TeamId } from "../domain/team-id.js";
import { SlackAdapterError } from "./errors.js";

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
  try {
    if (
      input.credentials.teamId !== input.teamId ||
      (input.credentials.user && input.credentials.user.teamId !== input.teamId) ||
      (input.credentials.bot && input.credentials.bot.teamId !== input.teamId)
    ) {
      throw mismatch(input.teamId);
    }
    return Object.freeze({ teamId: input.teamId, credentials: input.credentials });
  } catch (error) {
    if (error instanceof SlackAdapterError) throw error;
    throw mismatch(input.teamId);
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
