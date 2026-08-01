import { describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import type { WorkspaceSlackOperations } from "../../slack/adapter.js";
import { ensureWorkspaceChannel } from "../channel-management.js";

describe("workspace channel management local session", () => {
  it("uses the team-bound broker instead of resolving a raw credential", async () => {
    const teamId = parseTeamId("T0BJ9SG2M0R");
    const workspace = {
      teamId,
      alias: "wedgeai",
      domain: "wedgeai.slack.com",
      previousDomains: [],
      displayName: "WedgeAI",
      credentialRefs: { user: { provider: "environment", name: "WEDGE_TOKEN" } },
    };
    const connection = {
      version: 1 as const,
      teamId,
      credentialKind: "user" as const,
      socketPath: "/private/session.sock",
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
    };
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
});
