import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlamyClient } from "../lib/client.js";
import { createMockWebClient } from "./helpers/mock-slack.js";

vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(),
  LogLevel: { DEBUG: "debug", INFO: "info", WARN: "warn", ERROR: "error" },
}));

async function makeClient() {
  const mock = createMockWebClient();
  const { WebClient } = vi.mocked(await import("@slack/web-api"));
  (WebClient as any).mockImplementation(function () {
    return mock;
  });
  const client = new SlamyClient({ botToken: "xoxb-test", userToken: "xoxp-test" });
  return { client, mock };
}

const interactiveMessage = {
  ts: "1779639939.724639",
  user: "",
  text: ":memo: 返信ドラフト",
  bot_id: "B01ABCDEFG",
  subtype: "bot_message",
  team: "T01TEAMID",
  thread_ts: "1779639886.811289",
  reply_count: 2,
  blocks: [
    { type: "section", text: { type: "mrkdwn", text: ":memo: 返信ドラフト" } },
    { type: "actions", elements: [
      { type: "button", action_id: "approve", text: { type: "plain_text", text: "承認" } },
      { type: "button", action_id: "reject", text: { type: "plain_text", text: "却下" } },
    ] },
  ],
  attachments: [{ color: "#36a64f", text: "attachment body" }],
  reactions: [
    { name: "thumbsup", count: 2, users: ["U001", "U002"] },
    { name: "eyes", count: 1, users: ["U003"] },
  ],
};

describe("getChannelHistory: interactive fields", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("blocks / reactions / bot_id / attachments / subtype / team を透過する", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.history.mockResolvedValue({
      ok: true,
      messages: [interactiveMessage],
      has_more: false,
      response_metadata: { next_cursor: "" },
    } as any);

    const result = await client.getChannelHistory("C123", { limit: 5 });

    expect(result).toHaveLength(1);
    const m = result[0]!;
    expect(m.bot_id).toBe("B01ABCDEFG");
    expect(m.subtype).toBe("bot_message");
    expect(m.team).toBe("T01TEAMID");
    expect(m.thread_ts).toBe("1779639886.811289");
    expect(m.reply_count).toBe(2);
    expect(m.blocks).toHaveLength(2);
    expect(m.blocks?.[0]).toMatchObject({ type: "section" });
    expect(m.blocks?.[1]).toMatchObject({ type: "actions" });
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments?.[0]).toMatchObject({ color: "#36a64f", text: "attachment body" });
    expect(m.reactions).toEqual([
      { name: "thumbsup", count: 2, users: ["U001", "U002"] },
      { name: "eyes", count: 1, users: ["U003"] },
    ]);
  });
});

describe("getThreadReplies: interactive fields", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("thread_ts / reply_count / blocks / reactions / bot_id / attachments を透過する", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.replies.mockResolvedValue({
      ok: true,
      messages: [interactiveMessage],
    } as any);

    const result = await client.getThreadReplies("D0B4ALQ1A73", "1779639886.811289", { limit: 5 });

    expect(result).toHaveLength(1);
    const m = result[0]!;
    expect(m.bot_id).toBe("B01ABCDEFG");
    expect(m.subtype).toBe("bot_message");
    expect(m.team).toBe("T01TEAMID");
    expect(m.thread_ts).toBe("1779639886.811289");
    expect(m.reply_count).toBe(2);
    expect(m.blocks).toHaveLength(2);
    expect(m.attachments).toHaveLength(1);
    expect(m.reactions?.[0]?.name).toBe("thumbsup");
  });
});

describe("getMessageAt: interactive fields", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("blocks / reactions / bot_id / attachments / subtype / team を透過する", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.history.mockResolvedValue({
      ok: true,
      messages: [interactiveMessage],
    } as any);

    const result = await client.getMessageAt("C123", "1779639939.724639");

    expect(result).toHaveLength(1);
    const m = result[0]!;
    expect(m.bot_id).toBe("B01ABCDEFG");
    expect(m.blocks).toHaveLength(2);
    expect(m.reactions?.[0]?.name).toBe("thumbsup");
    expect(m.attachments).toHaveLength(1);
  });
});

describe("後方互換性: 旧フィールドのみのメッセージ", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("blocks / reactions などが無いプレーンメッセージは undefined", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.history.mockResolvedValue({
      ok: true,
      messages: [{ ts: "1700000000.000001", user: "U001", text: "plain text" }],
      has_more: false,
      response_metadata: { next_cursor: "" },
    } as any);

    const result = await client.getChannelHistory("C123");

    expect(result[0]!.bot_id).toBeUndefined();
    expect(result[0]!.subtype).toBeUndefined();
    expect(result[0]!.blocks).toBeUndefined();
    expect(result[0]!.reactions).toBeUndefined();
    expect(result[0]!.attachments).toBeUndefined();
    expect(result[0]!.text).toBe("plain text");
    expect(result[0]!.user).toBe("U001");
  });
});
