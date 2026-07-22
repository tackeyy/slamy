import { ensureChannel, type EnsureChannelResult } from "../commands/channel-management.js";
import type { CredentialResolver } from "../credentials/index.js";
import { createSlackWorkspaceContext, type WorkspaceSlackOperations } from "../slack/index.js";
import type { WorkspaceRegistry } from "../workspace/registry.js";
import { createCredentialResolver } from "./credentials.js";
import { createWorkspaceSlackAdapter } from "./slack.js";
import { createWorkspaceRegistry } from "./workspace.js";

export type EnsureWorkspaceChannelRequest = {
  readonly workspace: string;
  readonly name: string;
  readonly isPrivate: boolean;
  readonly topic: string;
  readonly purpose: string;
  readonly dryRun: boolean;
};

export type EnsureWorkspaceChannelOptions = {
  readonly registry?: WorkspaceRegistry;
  readonly credentialResolver?: CredentialResolver;
  readonly slack?: WorkspaceSlackOperations;
};

export async function ensureWorkspaceChannel(
  request: EnsureWorkspaceChannelRequest,
  options: EnsureWorkspaceChannelOptions = {},
): Promise<EnsureChannelResult> {
  const registry = options.registry ?? createWorkspaceRegistry();
  const workspace = await registry.resolve(request.workspace);
  return ensureChannel(
    {
      workspace: {
        teamId: workspace.teamId,
        alias: workspace.alias,
        domain: workspace.domain,
        displayName: workspace.displayName,
      },
      name: request.name,
      isPrivate: request.isPrivate,
      topic: request.topic,
      purpose: request.purpose,
      dryRun: request.dryRun,
    },
    async () => {
      const credentials = await (options.credentialResolver ?? createCredentialResolver())
        .resolveForWorkspace(workspace, {
          requiredKinds: ["user"],
          requiredScopes: { user: requiredUserScopes(request.isPrivate) },
          operation: "channels.create",
        });
      return {
        context: createSlackWorkspaceContext({ teamId: workspace.teamId, credentials }),
        slack: options.slack ?? createWorkspaceSlackAdapter(),
        dispose: () => credentials.destroy(),
      };
    },
  );
}

function requiredUserScopes(isPrivate: boolean): readonly string[] {
  return Object.freeze([
    "channels:read",
    "groups:read",
    ...(isPrivate
      ? ["groups:write", "groups:write.topic"]
      : ["channels:write", "channels:write.topic"]),
  ]);
}
