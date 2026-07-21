import { homedir } from "node:os";
import { join } from "node:path";
import { NodeFileWorkspaceStore } from "../workspace/node-file-workspace-store.js";
import { WorkspaceRegistry } from "../workspace/registry.js";

export type CreateWorkspaceRegistryOptions = {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
};

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
