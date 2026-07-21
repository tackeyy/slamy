import { homedir } from "node:os";
import { join } from "node:path";
import { parseTeamId } from "../domain/team-id.js";
import type { WorkspaceRecord } from "../domain/workspace.js";
import { NodeFileWorkspaceStore } from "../workspace/node-file-workspace-store.js";
import { WorkspaceRegistry } from "../workspace/registry.js";
import { normalizeWorkspaceDomain, validateWorkspaceAlias } from "../workspace/schema.js";

export type { WorkspaceRegistry } from "../workspace/registry.js";

export type CreateWorkspaceRegistryOptions = {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
};

export type CreateWorkspaceRecordInput = {
  teamId: string;
  alias: string;
  domain: string;
  previousDomains?: string[];
  displayName: string;
  userTokenEnv?: string;
  botTokenEnv?: string;
};

export function createWorkspaceRecord(input: CreateWorkspaceRecordInput): WorkspaceRecord {
  return {
    teamId: parseTeamId(input.teamId),
    alias: validateWorkspaceAlias(input.alias),
    domain: normalizeWorkspaceDomain(input.domain),
    previousDomains: (input.previousDomains ?? []).map(normalizeWorkspaceDomain),
    displayName: input.displayName,
    ...(input.userTokenEnv || input.botTokenEnv
      ? {
          credentialRefs: {
            ...(input.userTokenEnv
              ? { user: { provider: "environment" as const, name: input.userTokenEnv } }
              : {}),
            ...(input.botTokenEnv
              ? { bot: { provider: "environment" as const, name: input.botTokenEnv } }
              : {}),
          },
        }
      : {}),
  };
}

export function resolveWorkspaceConfigPath(
  options: Omit<CreateWorkspaceRegistryOptions, "configPath"> = {},
): string {
  const env = options.env ?? process.env;
  if (env.SLAMY_CONFIG_FILE) return env.SLAMY_CONFIG_FILE;
  const configHome = env.XDG_CONFIG_HOME || join(options.homeDirectory ?? homedir(), ".config");
  return join(configHome, "slamy", "workspaces.json");
}

export function createWorkspaceRegistry(
  options: CreateWorkspaceRegistryOptions = {},
): WorkspaceRegistry {
  const configPath = options.configPath ?? resolveWorkspaceConfigPath(options);
  return new WorkspaceRegistry(new NodeFileWorkspaceStore(configPath));
}
