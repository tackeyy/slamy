import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlamyClient } from "../client.js";
import { createMockWebClient } from "../../__tests__/helpers/mock-slack.js";

// Mock @slack/web-api
vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(),
}));

// Mock node:fs for uploadFile tests
vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from("file content")),
}));

let mockWebClient: ReturnType<typeof createMockWebClient>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockWebClient = createMockWebClient();
  const { WebClient } = await import("@slack/web-api");
  (WebClient as any).mockImplementation(() => mockWebClient);
});

describe("SlamyClient constructor", () => {
  it("userToken で初期化できる", () => {
    expect(() => new SlamyClient({ userToken: "xoxp-test" })).not.toThrow();
  });

  it("botToken で初期化できる", () => {
    expect(() => new SlamyClient({ botToken: "xoxb-test" })).not.toThrow();
  });

  it("トークンなしでエラー", () => {
    expect(() => new SlamyClient({})).toThrow("Either userToken or botToken must be provided");
  });
});

describe("トークン分離", () => {
  it("両トークン指定時、書き込み操作はbotToken、読み取り操作はuserTokenを使う", async () => {
    const botMock = createMockWebClient();
    const userMock = createMockWebClient();

    const { WebClient } = await import("@slack/web-api");
    (WebClient as any).mockImplementation((token: string) => {
      if (token === "xoxb-bot") return botMock;
      if (token === "xoxp-user") return userMock;
      return createMockWebClient();
    });

    const client = new SlamyClient({ botToken: "xoxb-bot", userToken: "xoxp-user" });

    // 書き込み操作 → botToken
    await client.postMessage("C1", "hello");
    expect(botMock.chat.postMessage).toHaveBeenCalled();
    expect(userMock.chat.postMessage).not.toHaveBeenCalled();

    await client.addReaction("C1", "ts1", "thumbsup");
    expect(botMock.reactions.add).toHaveBeenCalled();
    expect(userMock.reactions.add).not.toHaveBeenCalled();

    await client.uploadFile("C1", Buffer.from("data"), { filename: "f.txt" });
    expect(botMock.files.uploadV2).toHaveBeenCalled();
    expect(userMock.files.uploadV2).not.toHaveBeenCalled();

    // 読み取り操作 → userToken
    await client.searchMessages("test");
    expect(userMock.search.messages).toHaveBeenCalled();
    expect(botMock.search.messages).not.toHaveBeenCalled();

    await client.authTest();
    expect(userMock.auth.test).toHaveBeenCalled();
  });

  it("botTokenのみの場合、全操作がbotTokenで動作する", async () => {
    const botMock = createMockWebClient();

    const { WebClient } = await import("@slack/web-api");
    (WebClient as any).mockImplementation(() => botMock);

    const client = new SlamyClient({ botToken: "xoxb-bot" });

    await client.postMessage("C1", "hello");
    expect(botMock.chat.postMessage).toHaveBeenCalled();

    await client.authTest();
    expect(botMock.auth.test).toHaveBeenCalled();
  });

  it("userTokenのみの場合、全操作がuserTokenで動作する", async () => {
    const userMock = createMockWebClient();

    const { WebClient } = await import("@slack/web-api");
    (WebClient as any).mockImplementation(() => userMock);

    const client = new SlamyClient({ userToken: "xoxp-user" });

    await client.postMessage("C1", "hello");
    expect(userMock.chat.postMessage).toHaveBeenCalled();

    await client.searchMessages("test");
    expect(userMock.search.messages).toHaveBeenCalled();
  });
});

describe("postMessage", () => {
  it("短文メッセージを投稿する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const result = await client.postMessage("C123", "Hello");

    expect(mockWebClient.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "Hello",
    });
    expect(result).toEqual({ channel: "C123", ts: "1234567890.123456" });
  });

  it("長文メッセージを自動分割する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const longText = "a".repeat(2500) + "\n\n" + "b".repeat(2500);
    await client.postMessage("C123", longText);

    // First message + thread reply
    expect(mockWebClient.chat.postMessage).toHaveBeenCalledTimes(2);
    // Second call should have thread_ts
    expect(mockWebClient.chat.postMessage).toHaveBeenNthCalledWith(2, {
      channel: "C123",
      text: expect.any(String),
      thread_ts: "1234567890.123456",
    });
  });

  it("mrkdwn を自動修正する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.postMessage("C123", "**太字**テスト");

    expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "*太字* テスト",
    });
  });

  it("API エラーを伝播する", async () => {
    mockWebClient.chat.postMessage.mockRejectedValue(new Error("channel_not_found"));
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await expect(client.postMessage("INVALID", "test")).rejects.toThrow("channel_not_found");
  });
});

describe("replyToThread", () => {
  it("スレッドに返信する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const result = await client.replyToThread("C123", "ts123", "Reply");

    expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "Reply",
      thread_ts: "ts123",
    });
    expect(result.ts).toBe("1234567890.123456");
  });

  it("長文返信を自動分割する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const longText = "a".repeat(2500) + "\n\n" + "b".repeat(2500);
    await client.replyToThread("C123", "ts123", longText);

    expect(mockWebClient.chat.postMessage).toHaveBeenCalledTimes(2);
    // Both calls should have the same thread_ts
    for (const call of mockWebClient.chat.postMessage.mock.calls) {
      expect(call[0].thread_ts).toBe("ts123");
    }
  });
});

describe("updateMessage", () => {
  it("メッセージを更新する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const result = await client.updateMessage("C123", "ts123", "Updated");

    expect(mockWebClient.chat.update).toHaveBeenCalledWith({
      channel: "C123",
      ts: "ts123",
      text: "Updated",
    });
    expect(result).toEqual({ channel: "C123", ts: "ts123" });
  });

  it("4000文字超でエラー", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const longText = "a".repeat(4001);
    await expect(client.updateMessage("C123", "ts123", longText)).rejects.toThrow(
      "does not support auto-splitting",
    );
  });
});

describe("deleteMessage", () => {
  it("メッセージを削除する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.deleteMessage("C123", "ts123");
    expect(mockWebClient.chat.delete).toHaveBeenCalledWith({ channel: "C123", ts: "ts123" });
  });

  it("API エラーを伝播する", async () => {
    mockWebClient.chat.delete.mockRejectedValue(new Error("message_not_found"));
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await expect(client.deleteMessage("C123", "ts123")).rejects.toThrow("message_not_found");
  });
});

describe("addReaction / removeReaction", () => {
  it("リアクションを追加する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.addReaction("C123", "ts123", "thumbsup");
    expect(mockWebClient.reactions.add).toHaveBeenCalledWith({
      channel: "C123",
      timestamp: "ts123",
      name: "thumbsup",
    });
  });

  it("リアクションを削除する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.removeReaction("C123", "ts123", "thumbsup");
    expect(mockWebClient.reactions.remove).toHaveBeenCalledWith({
      channel: "C123",
      timestamp: "ts123",
      name: "thumbsup",
    });
  });

  it("リアクション追加エラーを伝播する", async () => {
    mockWebClient.reactions.add.mockRejectedValue(new Error("already_reacted"));
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await expect(client.addReaction("C123", "ts123", "thumbsup")).rejects.toThrow("already_reacted");
  });
});

describe("uploadFile", () => {
  it("ファイルパスからアップロードする", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.uploadFile("C123", "/path/to/file.pdf");

    expect(mockWebClient.files.uploadV2).toHaveBeenCalledWith({
      channel_id: "C123",
      thread_ts: undefined,
      file: Buffer.from("file content"),
      filename: "file.pdf",
      title: "file.pdf",
    });
  });

  it("Buffer からアップロードする", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const buf = Buffer.from("pdf data");
    await client.uploadFile("C123", buf, { filename: "report.pdf", title: "Report" });

    expect(mockWebClient.files.uploadV2).toHaveBeenCalledWith({
      channel_id: "C123",
      thread_ts: undefined,
      file: buf,
      filename: "report.pdf",
      title: "Report",
    });
  });

  it("スレッドにアップロードする", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.uploadFile("C123", Buffer.from("data"), {
      threadTs: "ts123",
      filename: "test.txt",
    });

    expect(mockWebClient.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({ thread_ts: "ts123" }),
    );
  });
});

describe("listChannels", () => {
  it("チャンネル一覧を取得する", async () => {
    mockWebClient.users.conversations.mockResolvedValue({
      ok: true,
      channels: [
        {
          id: "C1",
          name: "general",
          topic: { value: "General" },
          purpose: { value: "General chat" },
          num_members: 10,
          is_private: false,
          is_archived: false,
        },
      ],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const channels = await client.listChannels();

    expect(channels).toEqual([
      {
        id: "C1",
        name: "general",
        topic: "General",
        purpose: "General chat",
        num_members: 10,
        is_private: false,
        is_archived: false,
      },
    ]);
  });
});

describe("getChannelHistory", () => {
  it("チャンネル履歴を取得する", async () => {
    mockWebClient.conversations.history.mockResolvedValue({
      ok: true,
      messages: [
        { ts: "123.456", user: "U1", text: "Hello", reply_count: 2 },
      ],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const messages = await client.getChannelHistory("C123");

    expect(messages).toEqual([
      { ts: "123.456", user: "U1", text: "Hello", reply_count: 2, thread_ts: undefined },
    ]);
  });
});

describe("getThreadReplies (read)", () => {
  it("スレッド返信を取得する", async () => {
    mockWebClient.conversations.replies.mockResolvedValue({
      ok: true,
      messages: [
        { ts: "123.456", user: "U1", text: "Parent" },
        { ts: "123.457", user: "U2", text: "Reply" },
      ],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const msgs = await client.getThreadReplies("C123", "123.456");

    expect(msgs).toHaveLength(2);
    expect(msgs[1].text).toBe("Reply");
  });
});

describe("listUsers", () => {
  it("ユーザー一覧を取得する（ボット・無効ユーザー除外）", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [
        { id: "U1", name: "user1", real_name: "User One", profile: { display_name: "u1" }, is_bot: false, deleted: false },
        { id: "U2", name: "bot", real_name: "Bot", profile: { display_name: "bot" }, is_bot: true, deleted: false },
        { id: "U3", name: "deleted", real_name: "Gone", profile: { display_name: "" }, is_bot: false, deleted: true },
      ],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const users = await client.listUsers();

    expect(users).toHaveLength(1);
    expect(users[0].id).toBe("U1");
  });

  it("ボット含む", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [
        { id: "U1", name: "user1", real_name: "User One", profile: { display_name: "u1" }, is_bot: false, deleted: false },
        { id: "U2", name: "bot", real_name: "Bot", profile: { display_name: "bot" }, is_bot: true, deleted: false },
      ],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const users = await client.listUsers({ includeBots: true });

    expect(users).toHaveLength(2);
  });
});

describe("getUserProfile", () => {
  it("ユーザープロフィールを取得する", async () => {
    mockWebClient.users.info.mockResolvedValue({
      ok: true,
      user: {
        id: "U1",
        name: "user1",
        real_name: "User One",
        profile: {
          display_name: "u1",
          email: "u1@test.com",
          title: "Engineer",
          phone: "123",
          status_text: "Working",
          status_emoji: ":computer:",
        },
        tz: "Asia/Tokyo",
        is_admin: false,
        is_bot: false,
        deleted: false,
      },
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const profile = await client.getUserProfile("U1");

    expect(profile.email).toBe("u1@test.com");
    expect(profile.tz).toBe("Asia/Tokyo");
  });
});

describe("searchMessages", () => {
  it("メッセージを検索する", async () => {
    mockWebClient.search.messages.mockResolvedValue({
      ok: true,
      messages: {
        matches: [
          { ts: "123.456", channel: { id: "C1", name: "general" }, user: "U1", text: "Hello", permalink: "https://slack.com/test" },
        ],
        total: 1,
        paging: { page: 1 },
      },
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const result = await client.searchMessages("Hello");

    expect(result.total).toBe(1);
    expect(result.matches[0].text).toBe("Hello");
  });
});

describe("authTest", () => {
  it("認証情報を返す", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const info = await client.authTest();

    expect(info.user_id).toBe("U123");
    expect(info.team).toBe("TestTeam");
  });
});
