import { parseTeamId } from "../domain/team-id.js";
import type {
  EnvironmentCredentialRef,
  WorkspaceCredentialRefs,
  WorkspaceRecord,
  WorkspaceRegistryDocument,
} from "./types.js";

export function decodeWorkspaceRegistry(value: unknown): WorkspaceRegistryDocument {
  const input = value as Record<string, unknown>;
  const workspaces = (input.workspaces as Array<Record<string, unknown>>).map(decodeWorkspace);
  return {
    version: 1,
    ...(input.defaultTeamId === undefined
      ? {}
      : { defaultTeamId: parseTeamId(input.defaultTeamId) }),
    workspaces,
  };
}

function decodeWorkspace(input: Record<string, unknown>): WorkspaceRecord {
  return {
    teamId: parseTeamId(input.teamId),
    alias: input.alias as string,
    domain: input.domain as string,
    previousDomains: input.previousDomains as string[],
    displayName: input.displayName as string,
    ...(input.credentialRefs === undefined
      ? {}
      : { credentialRefs: decodeCredentialRefs(input.credentialRefs as Record<string, unknown>) }),
  };
}

function decodeCredentialRefs(input: Record<string, unknown>): WorkspaceCredentialRefs {
  return {
    ...(input.user === undefined
      ? {}
      : { user: decodeCredentialRef(input.user as Record<string, unknown>) }),
    ...(input.bot === undefined
      ? {}
      : { bot: decodeCredentialRef(input.bot as Record<string, unknown>) }),
  };
}

function decodeCredentialRef(input: Record<string, unknown>): EnvironmentCredentialRef {
  return {
    provider: input.provider as "environment",
    name: input.name as string,
  };
}
