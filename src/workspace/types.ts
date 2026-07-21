import type { TeamId } from "../domain/team-id.js";

export type {
  EnvironmentCredentialRef,
  WorkspaceCredentialRefs,
  WorkspaceRecord,
} from "../domain/workspace.js";

export type WorkspaceRegistryDocument = {
  version: 1;
  defaultTeamId?: TeamId;
  workspaces: import("../domain/workspace.js").WorkspaceRecord[];
};
