import {
  ensureChannel,
  inviteToChannel,
  type EnsureChannelResult,
  type InviteToChannelResult,
} from "../commands/channel-management.js";
import type { CredentialResolver } from "../credentials/index.js";
import type { VerifiedCredentialSet } from "../credentials/types.js";
import { createSlackWorkspaceContext, type WorkspaceSlackOperations } from "../slack/index.js";
import type { WorkspaceRegistry } from "../workspace/registry.js";
import { createCredentialResolver } from "./credentials.js";
import { createLocalSessionChannelOperations } from "./local-session-channel-operations.js";
import { findLocalSessionForWorkspace } from "./local-session-files.js";
import type { LocalSessionConnection } from "./local-session-web-client.js";
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
  readonly localSessionLookup?: (
    workspace: Awaited<ReturnType<WorkspaceRegistry["resolve"]>>,
  ) => Promise<LocalSessionConnection | undefined>;
  readonly localSessionSlackFactory?: (
    connection: LocalSessionConnection,
  ) => WorkspaceSlackOperations;
};

export type InviteWorkspaceChannelUsersRequest = {
  readonly workspace: string;
  readonly channelId: string;
  readonly userIds: readonly string[];
  readonly dryRun: boolean;
};

export type InviteWorkspaceChannelUsersOptions = EnsureWorkspaceChannelOptions;

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
      const localSessionLookup =
        options.localSessionLookup ??
        (options.credentialResolver || options.slack
          ? () => Promise.resolve(undefined)
          : (selected) => findLocalSessionForWorkspace(selected));
      const localSession = await localSessionLookup(workspace);
      if (localSession) {
        if (localSession.teamId !== workspace.teamId || localSession.credentialKind !== "user") {
          throw new Error("Local session does not match the selected workspace");
        }
        return {
          context: sessionContext(workspace.teamId),
          slack: (options.localSessionSlackFactory ?? createLocalSessionChannelOperations)(
            localSession,
          ),
          dispose() {},
        };
      }
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

export async function inviteWorkspaceChannelUsers(
  request: InviteWorkspaceChannelUsersRequest,
  options: InviteWorkspaceChannelUsersOptions = {},
): Promise<InviteToChannelResult> {
  const registry = options.registry ?? createWorkspaceRegistry();
  const workspace = await registry.resolve(request.workspace);
  return inviteToChannel(
    {
      workspace: {
        teamId: workspace.teamId,
        alias: workspace.alias,
        domain: workspace.domain,
        displayName: workspace.displayName,
      },
      channelId: request.channelId,
      userIds: request.userIds,
      dryRun: request.dryRun,
    },
    async () => {
      const localSessionLookup =
        options.localSessionLookup ??
        (options.credentialResolver || options.slack
          ? () => Promise.resolve(undefined)
          : (selected) => findLocalSessionForWorkspace(selected));
      const localSession = await localSessionLookup(workspace);
      if (localSession) {
        if (localSession.teamId !== workspace.teamId || localSession.credentialKind !== "user") {
          throw new Error("Local session does not match the selected workspace");
        }
        return {
          context: sessionContext(workspace.teamId),
          slack: (options.localSessionSlackFactory ?? createLocalSessionChannelOperations)(
            localSession,
          ),
          dispose() {},
        };
      }
      const credentials = await (options.credentialResolver ?? createCredentialResolver())
        .resolveForWorkspace(workspace, {
          requiredKinds: ["user"],
          requiredScopes: { user: ["channels:write", "groups:write"] },
          operation: "conversations.invite",
        });
      return {
        context: createSlackWorkspaceContext({ teamId: workspace.teamId, credentials }),
        slack: options.slack ?? createWorkspaceSlackAdapter(),
        dispose: () => credentials.destroy(),
      };
    },
  );
}

function sessionContext(teamId: Awaited<ReturnType<WorkspaceRegistry["resolve"]>>["teamId"]) {
  const credential = Object.freeze({
    kind: "user" as const,
    teamId,
    use(): never {
      throw new Error("Local session credentials are broker-only");
    },
    destroy() {},
  });
  const credentials: VerifiedCredentialSet = Object.freeze({
    teamId,
    user: credential,
    requiredScopes: Object.freeze({}),
    destroy() {},
  });
  return createSlackWorkspaceContext({ teamId, credentials });
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
