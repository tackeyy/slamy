import { describe, expect, it } from "vitest";
import { WorkspaceSlackAdapter } from "../adapter.js";
import type { SlackTransport, SlackTransportRequest } from "../transport.js";
import { contextWith, PRIMARY_TEAM_ID } from "./helpers.js";

class QueueTransport implements SlackTransport {
  readonly requests: SlackTransportRequest[] = [];

  constructor(readonly responses: unknown[]) {}

  call(request: SlackTransportRequest): Promise<unknown> {
    this.requests.push(request);
    return Promise.resolve(this.responses.shift());
  }
}

describe("WorkspaceSlackAdapter named operations", () => {
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
      { types: "public_channel", limit: 200 },
      { types: "public_channel", limit: 200, cursor: "cursor-2" },
    ]);
    expect(transport.requests.every((request) => request.teamId === PRIMARY_TEAM_ID)).toBe(true);
  });

  it("maps message search through the User-only search policy", async () => {
    const transport = new QueueTransport([
      {
        ok: true,
        messages: {
          matches: [
            {
              channel_id: "C0123ABC",
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
      arguments: { query: "release", count: 20 },
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
