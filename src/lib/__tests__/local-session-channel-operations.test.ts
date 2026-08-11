import { describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import { createLocalSessionChannelOperations } from "../local-session-channel-operations.js";

describe("local session channel operations", () => {
  it("maps channel management operations to the broker without credentials", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        channels: [{ id: "C1", name: "general", is_archived: false, is_private: false }],
        response_metadata: { next_cursor: "" },
      })
      .mockResolvedValueOnce({
        ok: true,
        channel: { id: "C2", name: "new-channel", is_archived: false, is_private: false },
      });
    const connection = {
      version: 1 as const,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "user" as const,
      socketPath: "/private/session.sock",
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
    };
    const operations = createLocalSessionChannelOperations(connection, request);

    await expect(operations.listAllPublicConversations({} as never)).resolves.toEqual([
      { channelId: "C1", name: "general", isArchived: false, isPrivate: false },
    ]);
    await expect(
      operations.createConversation({} as never, { name: "new-channel", isPrivate: false }),
    ).resolves.toMatchObject({ channelId: "C2", name: "new-channel" });
    expect(request).toHaveBeenNthCalledWith(1, connection, "conversations.list", {
      types: "public_channel",
      limit: 200,
      exclude_archived: false,
    });
    expect(request).toHaveBeenNthCalledWith(2, connection, "conversations.create", {
      name: "new-channel",
      is_private: false,
    });
  });

  it("paginates private channels and maps purpose, topic, and info fallbacks", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        channels: [{ id: "C1", name: "private-one", is_archived: true, is_private: true }],
        response_metadata: { next_cursor: "next" },
      })
      .mockResolvedValueOnce({
        channels: [{ id: "C2", name: "private-two" }],
      })
      .mockResolvedValueOnce({ channel: { purpose: { value: "stored purpose" } } })
      .mockResolvedValueOnce({ channel: {} })
      .mockResolvedValueOnce({
        channel: {
          id: "C2",
          name: "private-two",
          is_private: true,
          topic: { value: "topic" },
          purpose: { value: "purpose" },
        },
      });
    const connection = {
      version: 1 as const,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "user" as const,
      socketPath: "/private/session.sock",
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
    };
    const operations = createLocalSessionChannelOperations(connection, request);

    await expect(operations.listAllPrivateConversations({} as never)).resolves.toHaveLength(2);
    await expect(operations.setConversationPurpose({} as never, {
      channelId: "C2", purpose: "requested purpose", isPrivate: true,
    })).resolves.toEqual({ channelId: "C2", value: "stored purpose" });
    await expect(operations.setConversationTopic({} as never, {
      channelId: "C2", topic: "requested topic", isPrivate: true,
    })).resolves.toEqual({ channelId: "C2", value: "requested topic" });
    await expect(operations.getConversationInfo({} as never, {
      channelId: "C2", isPrivate: true,
    })).resolves.toEqual({
      channelId: "C2",
      name: "private-two",
      isArchived: false,
      isPrivate: true,
      topic: "topic",
      purpose: "purpose",
    });
    expect(request).toHaveBeenNthCalledWith(2, connection, "conversations.list", expect.objectContaining({
      cursor: "next",
      types: "private_channel",
    }));
  });

  it("rejects repeated cursors and malformed Slack responses", async () => {
    const connection = {
      version: 1 as const,
      teamId: parseTeamId("T0BJ9SG2M0R"),
      credentialKind: "user" as const,
      socketPath: "/private/session.sock",
      capability: "local-capability-canary",
      createdAt: "2029-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
    };
    const repeated = createLocalSessionChannelOperations(connection, vi.fn()
      .mockResolvedValueOnce({ channels: [], response_metadata: { next_cursor: "same" } })
      .mockResolvedValueOnce({ channels: [], response_metadata: { next_cursor: "same" } }));
    await expect(repeated.listAllPublicConversations({} as never)).rejects.toThrow("repeated a cursor");

    const malformed = createLocalSessionChannelOperations(connection, vi.fn().mockResolvedValue({ channels: {} }));
    await expect(malformed.listAllPublicConversations({} as never)).rejects.toThrow("invalid Slack response");
  });
});
