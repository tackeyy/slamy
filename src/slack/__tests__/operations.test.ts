import { describe, expect, it } from "vitest";
import { WorkspaceSlackAdapter } from "../adapter.js";
import type { SlackTransport, SlackTransportRequest } from "../transport.js";
import { contextWith, PRIMARY_TEAM_ID } from "./helpers.js";

class QueueTransport implements SlackTransport {
  readonly requests: SlackTransportRequest[] = [];

  constructor(readonly responses: unknown[]) {}

  call(request: SlackTransportRequest): Promise<unknown> {
    this.requests.push(request);
    const response = this.responses.shift();
    return response instanceof TransportFailure
      ? Promise.reject(response.cause)
      : Promise.resolve(response);
  }
}

class TransportFailure {
  constructor(readonly cause: unknown) {}
}

describe("WorkspaceSlackAdapter named operations", () => {
  it("creates a public channel with the explicit workspace User credential", async () => {
    const transport = new QueueTransport([
      {
        ok: true,
        channel: {
          id: "C0123ABC",
          name: "01-engineering",
          is_archived: false,
          is_private: false,
        },
      },
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport, requestIdFactory: idFactory() });
    const context = contextWith({ userToken: "xoxp-user", userScopes: ["channels:write"] });

    await expect(
      adapter.createConversation(context, { name: "01-engineering", isPrivate: false }),
    ).resolves.toEqual({
      channelId: "C0123ABC",
      name: "01-engineering",
      isArchived: false,
      isPrivate: false,
    });
    expect(transport.requests).toEqual([
      {
        method: "conversations.create",
        token: "xoxp-user",
        teamId: PRIMARY_TEAM_ID,
        requestId: "req-1",
        arguments: { name: "01-engineering", is_private: false, team_id: PRIMARY_TEAM_ID },
      },
    ]);
  });

  it("creates a private channel only with the private-channel scope contract", async () => {
    const transport = new QueueTransport([
      {
        ok: true,
        channel: {
          id: "G0123ABC",
          name: "11-board",
          is_archived: false,
          is_private: true,
        },
      },
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport, requestIdFactory: idFactory() });
    const context = contextWith({ userToken: "xoxp-user", userScopes: ["groups:write"] });

    await expect(
      adapter.createConversation(context, { name: "11-board", isPrivate: true }),
    ).resolves.toMatchObject({ channelId: "G0123ABC", name: "11-board", isPrivate: true });
    expect(transport.requests[0]).toMatchObject({
      method: "conversations.create",
      arguments: { name: "11-board", is_private: true, team_id: PRIMARY_TEAM_ID },
    });
  });

  it("verifies User and Bot identities against the explicit workspace", async () => {
    const transport = new QueueTransport([
      { ok: true, team_id: PRIMARY_TEAM_ID, user_id: "U00000001" },
      {
        ok: true,
        team_id: PRIMARY_TEAM_ID,
        user_id: "U00000002",
        bot_id: "B00000001",
        enterprise_id: "E00000001",
      },
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport, requestIdFactory: idFactory() });
    const context = contextWith({ userToken: "xoxp-user", botToken: "xoxb-bot" });

    await expect(adapter.verifyWorkspace(context, "user")).resolves.toEqual({
      teamId: PRIMARY_TEAM_ID,
      userId: "U00000001",
    });
    await expect(adapter.verifyWorkspace(context, "bot")).resolves.toEqual({
      teamId: PRIMARY_TEAM_ID,
      userId: "U00000002",
      botId: "B00000001",
      enterpriseId: "E00000001",
    });
    expect(transport.requests.map(({ method, token }) => ({ method, token }))).toEqual([
      { method: "auth.test", token: "xoxp-user" },
      { method: "auth.test", token: "xoxb-bot" },
    ]);
  });

  it("rejects auth.test Team mismatches and invalid Bot identities", async () => {
    const transport = new QueueTransport([
      { ok: true, team_id: "T00000002", user_id: "U00000001" },
      { ok: true, team_id: PRIMARY_TEAM_ID, user_id: "U00000002" },
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport });
    const context = contextWith({ userToken: "xoxp-user", botToken: "xoxb-bot" });

    await expect(adapter.verifyWorkspace(context, "user")).rejects.toMatchObject({
      code: "WORKSPACE_CONTEXT_MISMATCH",
    });
    await expect(adapter.verifyWorkspace(context, "bot")).rejects.toMatchObject({
      code: "INVALID_SLACK_RESPONSE",
    });
  });

  it("maps and follows public-conversation cursor pages using a User credential", async () => {
    const transport = new QueueTransport([
      {
        ok: true,
        channels: [],
        response_metadata: { next_cursor: "cursor-2" },
      },
      {
        ok: true,
        channels: [
          { id: "C0123ABC", name: "general", is_archived: false, is_private: false },
        ],
        response_metadata: { next_cursor: "" },
      },
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport, requestIdFactory: idFactory() });
    const context = contextWith({
      userToken: "xoxp-user",
      userScopes: ["channels:read"],
    });

    await expect(adapter.listAllPublicConversations(context, { limit: 200 })).resolves.toEqual([
      {
        channelId: "C0123ABC",
        name: "general",
        isArchived: false,
        isPrivate: false,
      },
    ]);
    expect(transport.requests.map((request) => request.arguments)).toEqual([
      { team_id: PRIMARY_TEAM_ID, types: "public_channel", limit: 200 },
      {
        team_id: PRIMARY_TEAM_ID,
        types: "public_channel",
        limit: 200,
        cursor: "cursor-2",
      },
    ]);
    expect(transport.requests.every((request) => request.teamId === PRIMARY_TEAM_ID)).toBe(true);
  });

  it("preserves a normalized rate limit from a later conversation page", async () => {
    const transport = new QueueTransport([
      { ok: true, channels: [], response_metadata: { next_cursor: "cursor-2" } },
      new TransportFailure({
        code: "slack_webapi_rate_limited_error",
        retryAfter: 17,
        message: "xoxp-page-rate-limit-canary",
      }),
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport, requestIdFactory: idFactory() });

    await expect(
      adapter.listAllPublicConversations(
        contextWith({ userToken: "xoxp-user", userScopes: ["channels:read"] }),
      ),
    ).rejects.toMatchObject({
      code: "SLACK_RATE_LIMITED",
      retryAfterSeconds: 17,
      requestId: "req-2",
      method: "conversations.list",
      teamId: PRIMARY_TEAM_ID,
    });
  });

  it("starts all-conversation traversal from the caller's explicit cursor", async () => {
    const transport = new QueueTransport([
      { ok: true, channels: [], response_metadata: { next_cursor: "" } },
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport });

    await adapter.listAllPublicConversations(
      contextWith({ userToken: "xoxp-user", userScopes: ["channels:read"] }),
      { cursor: "cursor-start" },
    );

    expect(transport.requests[0]?.arguments).toMatchObject({ cursor: "cursor-start" });
  });

  it("maps message search through the User-only search policy", async () => {
    const transport = new QueueTransport([
      {
        ok: true,
        messages: {
          matches: [
            {
              channel: { id: "C0123ABC", name: "general" },
              ts: "1700000000.000001",
              text: "first\nsecond",
            },
          ],
        },
      },
    ]);
    const adapter = new WorkspaceSlackAdapter({ transport });
    const context = contextWith({ userToken: "xoxp-user", userScopes: ["search:read"] });

    await expect(adapter.searchMessages(context, { query: "release", count: 20 })).resolves.toEqual([
      {
        channelId: "C0123ABC",
        timestamp: "1700000000.000001",
        text: "first\nsecond",
      },
    ]);
    expect(transport.requests[0]).toMatchObject({
      method: "search.messages",
      token: "xoxp-user",
      teamId: PRIMARY_TEAM_ID,
      arguments: { team_id: PRIMARY_TEAM_ID, query: "release", count: 20 },
    });
  });

  it("normalizes invalid inputs and response getters without leaking raw values", async () => {
    const canary = "xoxp-operation-secret-canary";
    const response = {
      ok: true,
      get team(): never {
        throw new Error(canary);
      },
    };
    const transport = new QueueTransport([response]);
    const adapter = new WorkspaceSlackAdapter({ transport });
    const context = contextWith({ userToken: "xoxp-user", userScopes: ["team:read"] });

    let caught: unknown;
    try {
      await adapter.getTeamInfo(context);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "INVALID_SLACK_RESPONSE" });
    expect(String(caught)).not.toContain(canary);
    expect(JSON.stringify(caught)).not.toContain(canary);
    expect(caught instanceof Error ? caught.stack : "").not.toContain(canary);

    await expect(
      adapter.searchMessages(contextWith({ userToken: "xoxp-user", userScopes: ["search:read"] }), {
        query: "",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SLACK_INPUT" });
  });
});

function idFactory(): () => string {
  let value = 0;
  return () => `req-${++value}`;
}
