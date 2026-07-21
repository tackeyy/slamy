import type { TeamId } from "./team-id.js";

export type EnvironmentCredentialRef = {
  provider: "environment";
  name: string;
};

export type WorkspaceCredentialRefs = {
  user?: EnvironmentCredentialRef;
  bot?: EnvironmentCredentialRef;
};

export type WorkspaceRecord = {
  teamId: TeamId;
  alias: string;
  domain: string;
  previousDomains: string[];
  displayName: string;
  credentialRefs?: WorkspaceCredentialRefs;
};

export type WorkspaceView = WorkspaceRecord & { isDefault: boolean };
