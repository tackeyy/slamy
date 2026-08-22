import { describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import type { WorkspaceSlackOperations } from "../../slack/adapter.js";
import {
  ensureWorkspaceChannel,
  inviteWorkspaceChannelUsers,
} from "../channel-management.js";

describe("workspace channel management local session", () => {
  it("returns a dry-run plan without local-session or credential lookup", async () => {
    const teamId = parseTeamId("T0BJ9SG2M0R");
    const localSessionLookup = vi.fn();
    const credentialResolver = { resolveForWorkspace: vi.fn() };

    await expect(
      inviteWorkspaceChannelUsers(
        {
          workspace: "wedgeai",
          channelId: "C0123ABC",
          userIds: ["U00000001"],
          dryRun: true,
        },
        {
          registry: { resolve: vi.fn().mockResolvedValue(workspaceWith(teamId)) } as never,
          credentialResolver: credentialResolver as never,
          localSessionLookup,
        },
      ),
    ).resolves.toEqual({
      status: "planned",
      channelId: "C0123ABC",
      invited: ["U00000001"],
      alreadyInChannel: [],
    });
    expect(localSessionLookup).not.toHaveBeenCalled();
    expect(credentialResolver.resolveForWorkspace).not.toHaveBeenCalled();
  });

  it("uses the team-bound broker for channel invites instead of resolving a raw credential", async () => {
    const teamId = parseTeamId("T0BJ9SG2M0R");
    const workspace = workspaceWith(teamId);
    const connection = connectionWith(teamId);
    const slack = {
      inviteToConversation: vi.fn().mockResolvedValue({}),
    } as unknown as WorkspaceSlackOperations;
    const localSessionSlackFactory = vi.fn().mockReturnValue(slack);
    const credentialResolver = { resolveForWorkspace: vi.fn() };

    await expect(
      inviteWorkspaceChannelUsers(
        {
          workspace: "wedgeai",
          channelId: "C0123ABC",
          userIds: ["U00000001"],
          dryRun: false,
        },
        {
          registry: { resolve: vi.fn().mockResolvedValue(workspace) } as never,
          credentialResolver: credentialResolver as never,
          localSessionLookup: vi.fn().mockResolvedValue(connection),
          localSessionSlackFactory,
        },
      ),
    ).resolves.toMatchObject({ status: "invited", invited: ["U00000001"] });
    expect(localSessionSlackFactory).toHaveBeenCalledWith(connection);
    expect(credentialResolver.resolveForWorkspace).not.toHaveBeenCalled();
  });

  it("uses the team-bound broker instead of resolving a raw credential", async () => {
    const teamId = parseTeamId("T0BJ9SG2M0R");
    const workspace = workspaceWith(teamId);
    const connection = connectionWith(teamId);
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([
        { channelId: "C1", name: "general", isArchived: false, isPrivate: false },
      ]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      setConversationPurpose: vi.fn().mockResolvedValue({}),
      setConversationTopic: vi.fn().mockResolvedValue({}),
      getConversationInfo: vi.fn().mockResolvedValue({
        channelId: "C1",
        name: "general",
        isArchived: false,
        isPrivate: false,
        topic: "topic",
        purpose: "purpose",
      }),
    } as unknown as WorkspaceSlackOperations;
    const localSessionSlackFactory = vi.fn().mockReturnValue(slack);
    const credentialResolver = { resolveForWorkspace: vi.fn() };

    await expect(
      ensureWorkspaceChannel(
        {
          workspace: "wedgeai",
          name: "general",
          isPrivate: false,
          topic: "topic",
          purpose: "purpose",
          dryRun: false,
        },
        {
          registry: { resolve: vi.fn().mockResolvedValue(workspace) } as never,
          credentialResolver: credentialResolver as never,
          localSessionLookup: vi.fn().mockResolvedValue(connection),
          localSessionSlackFactory,
        },
      ),
    ).resolves.toMatchObject({ status: "existing", channelId: "C1" });
    expect(localSessionSlackFactory).toHaveBeenCalledWith(connection);
    expect(credentialResolver.resolveForWorkspace).not.toHaveBeenCalled();
  });

  it("requests the documented user scopes and operation without a local session", async () => {
    const teamId = parseTeamId("T0BJ9SG2M0R");
    const destroy = vi.fn();
    const credentials = {
      teamId,
      user: {
        kind: "user" as const,
        teamId,
        use<Result>(consumer: (token: string) => Result): Result {
          return consumer("xoxp-user");
        },
        destroy() {},
      },
      requiredScopes: { user: ["channels:write", "groups:write"] },
      destroy,
    };
    const credentialResolver = {
      resolveForWorkspace: vi.fn().mockResolvedValue(credentials),
    };
    const slack = {
      inviteToConversation: vi.fn().mockResolvedValue({}),
    } as unknown as WorkspaceSlackOperations;

    await inviteWorkspaceChannelUsers(
      {
        workspace: "wedgeai",
        channelId: "C0123ABC",
        userIds: ["U00000001"],
        dryRun: false,
      },
      {
        registry: { resolve: vi.fn().mockResolvedValue(workspaceWith(teamId)) } as never,
        credentialResolver: credentialResolver as never,
        localSessionLookup: vi.fn().mockResolvedValue(undefined),
        slack,
      },
    );

    expect(credentialResolver.resolveForWorkspace).toHaveBeenCalledWith(
      expect.anything(),
      {
        requiredKinds: ["user"],
        requiredScopes: { user: ["channels:write", "groups:write"] },
        operation: "conversations.invite",
      },
    );
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

function workspaceWith(teamId: ReturnType<typeof parseTeamId>) {
  return {
    teamId,
    alias: "wedgeai",
    domain: "wedgeai.slack.com",
    previousDomains: [],
    displayName: "WedgeAI",
    credentialRefs: { user: { provider: "environment", name: "WEDGE_TOKEN" } },
  };
}

function connectionWith(teamId: ReturnType<typeof parseTeamId>) {
  return {
    version: 1 as const,
    teamId,
    credentialKind: "user" as const,
    socketPath: "/private/session.sock",
    capability: "local-capability-canary",
    createdAt: "2029-01-01T00:00:00.000Z",
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}
