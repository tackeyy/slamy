import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SlamyClient } from "../client.js";
import { createMockWebClient } from "../../__tests__/helpers/mock-slack.js";

// Mock @slack/web-api
vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(),
  LogLevel: { DEBUG: "debug", INFO: "info", WARN: "warn", ERROR: "error" },
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
  (WebClient as any).mockImplementation(function () { return mockWebClient; });
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
    (WebClient as any).mockImplementation(function (token: string) {
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
    (WebClient as any).mockImplementation(function () { return botMock; });

    const client = new SlamyClient({ botToken: "xoxb-bot" });

    await client.postMessage("C1", "hello");
    expect(botMock.chat.postMessage).toHaveBeenCalled();

    await client.authTest();
    expect(botMock.auth.test).toHaveBeenCalled();
  });

  it("userTokenのみの場合、全操作がuserTokenで動作する", async () => {
    const userMock = createMockWebClient();

    const { WebClient } = await import("@slack/web-api");
    (WebClient as any).mockImplementation(function () { return userMock; });

    const client = new SlamyClient({ userToken: "xoxp-user" });

    await client.postMessage("C1", "hello");
    expect(userMock.chat.postMessage).toHaveBeenCalled();

    await client.searchMessages("test");
    expect(userMock.search.messages).toHaveBeenCalled();
  });
});

describe("scheduleMessage", () => {
  it("メッセージをスケジュール投稿する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const postAt = 1700000000;
    const result = await client.scheduleMessage("C123", "Hello later", postAt);

    expect(mockWebClient.chat.scheduleMessage).toHaveBeenCalledTimes(1);
    expect(mockWebClient.chat.scheduleMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "Hello later",
      post_at: postAt,
    });
    expect(result).toEqual({
      channel: "C123",
      scheduled_message_id: "Q1234567890",
      post_at: postAt,
    });
  });

  it("40000文字超でエラー (chat.scheduleMessage は chat.postMessage と同じ上限)", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const longText = "a".repeat(40001);
    await expect(client.scheduleMessage("C123", longText, 1700000000)).rejects.toThrow(
      "does not support auto-splitting",
    );
  });

  it("40000文字以内なら成功する (旧 3900 制限なら 5000 chars でも失敗していた)", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.scheduleMessage("C123", "a".repeat(5000), 1700000000);
    expect(mockWebClient.chat.scheduleMessage).toHaveBeenCalledTimes(1);
  });

  it("mrkdwn を自動修正する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.scheduleMessage("C123", "**太字**テスト", 1700000000);

    expect(mockWebClient.chat.scheduleMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "*太字* テスト",
      post_at: 1700000000,
    });
  });

  it("API エラーを伝播する", async () => {
    mockWebClient.chat.scheduleMessage.mockRejectedValue(new Error("time_in_past"));
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await expect(client.scheduleMessage("C123", "test", 1000)).rejects.toThrow("time_in_past");
  });

  it("書き込み操作なので botClient を使う", async () => {
    const botMock = createMockWebClient();
    const userMock = createMockWebClient();

    const { WebClient } = await import("@slack/web-api");
    (WebClient as any).mockImplementation(function (token: string) {
      if (token === "xoxb-bot") return botMock;
      if (token === "xoxp-user") return userMock;
      return createMockWebClient();
    });

    const client = new SlamyClient({ botToken: "xoxb-bot", userToken: "xoxp-user" });
    await client.scheduleMessage("C123", "test", 1700000000);

    expect(botMock.chat.scheduleMessage).toHaveBeenCalled();
    expect(userMock.chat.scheduleMessage).not.toHaveBeenCalled();
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

  it("長文メッセージを自動分割する (chat.postMessage 上限 40000 を超える場合)", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    // 25000 + \n\n + 25000 = chat.postMessage 上限 (40000) を超える
    const longText = "a".repeat(25000) + "\n\n" + "b".repeat(25000);
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

  it("長文返信を自動分割する (chat.postMessage 上限 40000 を超える場合)", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const longText = "a".repeat(25000) + "\n\n" + "b".repeat(25000);
    await client.replyToThread("C123", "ts123", longText);

    expect(mockWebClient.chat.postMessage).toHaveBeenCalledTimes(2);
    // Both calls should have the same thread_ts
    for (const call of mockWebClient.chat.postMessage.mock.calls) {
      expect(call[0].thread_ts).toBe("ts123");
    }
  });

  it("5000 文字程度なら 1 chunk で送る (chat.postMessage 上限 40000 内)", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const text = "x".repeat(5000);
    await client.replyToThread("C123", "ts123", text);

    expect(mockWebClient.chat.postMessage).toHaveBeenCalledTimes(1);
  });

  it("broadcast オプションで reply_broadcast: true を送信する", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const result = await client.replyToThread("C123", "ts123", "Broadcast reply", { broadcast: true });

    expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "Broadcast reply",
      thread_ts: "ts123",
      reply_broadcast: true,
    });
    expect(result.ts).toBe("1234567890.123456");
  });

  it("broadcast なしでは reply_broadcast を含めない", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.replyToThread("C123", "ts123", "Normal reply");

    expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith({
      channel: "C123",
      text: "Normal reply",
      thread_ts: "ts123",
    });
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

  it("mrkdwn を自動修正する (postMessage と一貫した挙動)", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.updateMessage("C123", "ts123", "**太字**テスト");

    expect(mockWebClient.chat.update).toHaveBeenCalledWith({
      channel: "C123",
      ts: "ts123",
      text: "*太字* テスト",
    });
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

  it("oldest/latest を指定して期間フィルタする", async () => {
    mockWebClient.conversations.history.mockResolvedValue({
      ok: true,
      messages: [
        { ts: "1710000000.000000", user: "U1", text: "Morning msg" },
      ],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.getChannelHistory("C123", {
      oldest: "1709913600",
      latest: "1710000000",
    });

    expect(mockWebClient.conversations.history).toHaveBeenCalledWith({
      channel: "C123",
      limit: 20,
      oldest: "1709913600",
      latest: "1710000000",
    });
  });

  it("oldest のみ指定", async () => {
    mockWebClient.conversations.history.mockResolvedValue({
      ok: true,
      messages: [],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.getChannelHistory("C123", { oldest: "1709913600" });

    expect(mockWebClient.conversations.history).toHaveBeenCalledWith({
      channel: "C123",
      limit: 20,
      oldest: "1709913600",
    });
  });

  it("oldest/latest と limit を組み合わせる", async () => {
    mockWebClient.conversations.history.mockResolvedValue({
      ok: true,
      messages: [],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.getChannelHistory("C123", {
      limit: 100,
      oldest: "1709913600",
      latest: "1710000000",
    });

    expect(mockWebClient.conversations.history).toHaveBeenCalledWith({
      channel: "C123",
      limit: 100,
      oldest: "1709913600",
      latest: "1710000000",
    });
  });

  it("ページネーションで複数ページを自動取得する", async () => {
    mockWebClient.conversations.history
      .mockResolvedValueOnce({
        ok: true,
        messages: [
          { ts: "100.001", user: "U1", text: "msg1" },
          { ts: "100.002", user: "U2", text: "msg2" },
        ],
        has_more: true,
        response_metadata: { next_cursor: "cursor1" },
      })
      .mockResolvedValueOnce({
        ok: true,
        messages: [
          { ts: "100.003", user: "U3", text: "msg3" },
        ],
        has_more: false,
        response_metadata: { next_cursor: "" },
      });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const messages = await client.getChannelHistory("C123", { limit: 500 });

    expect(messages).toHaveLength(3);
    expect(messages[0].text).toBe("msg1");
    expect(messages[2].text).toBe("msg3");
    expect(mockWebClient.conversations.history).toHaveBeenCalledTimes(2);
    // 2回目の呼び出しに cursor が渡されていること
    expect(mockWebClient.conversations.history).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ cursor: "cursor1" }),
    );
  });

  it("limit に達したらページネーションを中断する", async () => {
    mockWebClient.conversations.history
      .mockResolvedValueOnce({
        ok: true,
        messages: [
          { ts: "100.001", user: "U1", text: "msg1" },
          { ts: "100.002", user: "U2", text: "msg2" },
          { ts: "100.003", user: "U3", text: "msg3" },
        ],
        has_more: true,
        response_metadata: { next_cursor: "cursor1" },
      })
      .mockResolvedValueOnce({
        ok: true,
        messages: [
          { ts: "100.004", user: "U4", text: "msg4" },
        ],
        has_more: false,
        response_metadata: { next_cursor: "" },
      });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    // limit=3 なので1ページ目の3件取得後に打ち切り
    const messages = await client.getChannelHistory("C123", { limit: 3 });

    expect(messages).toHaveLength(3);
    expect(mockWebClient.conversations.history).toHaveBeenCalledTimes(1);
  });

  it("has_more が false ならページネーションしない", async () => {
    mockWebClient.conversations.history.mockResolvedValue({
      ok: true,
      messages: [
        { ts: "100.001", user: "U1", text: "msg1" },
      ],
      has_more: false,
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    await client.getChannelHistory("C123", { limit: 500 });

    expect(mockWebClient.conversations.history).toHaveBeenCalledTimes(1);
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

describe("getChannelMembers", () => {
  it("チャンネルメンバー一覧を取得する", async () => {
    mockWebClient.conversations.members.mockResolvedValue({
      ok: true,
      members: ["U1", "U2", "U3"],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const members = await client.getChannelMembers("C123");

    expect(members).toEqual(["U1", "U2", "U3"]);
    expect(mockWebClient.conversations.members).toHaveBeenCalledWith({
      channel: "C123",
      limit: 200,
    });
  });

  it("ページネーションで全メンバーを取得する", async () => {
    mockWebClient.conversations.members
      .mockResolvedValueOnce({
        ok: true,
        members: ["U1", "U2"],
        response_metadata: { next_cursor: "cursor1" },
      })
      .mockResolvedValueOnce({
        ok: true,
        members: ["U3"],
        response_metadata: { next_cursor: "" },
      });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const members = await client.getChannelMembers("C123");

    expect(members).toEqual(["U1", "U2", "U3"]);
    expect(mockWebClient.conversations.members).toHaveBeenCalledTimes(2);
  });

  it("API エラーを伝播する", async () => {
    mockWebClient.conversations.members.mockRejectedValue(new Error("channel_not_found"));
    const client = new SlamyClient({ userToken: "xoxp-test" });
    await expect(client.getChannelMembers("INVALID")).rejects.toThrow("channel_not_found");
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

describe("setAssistantStatus", () => {
  it("status のみで assistant.threads.setStatus を呼ぶ（書き込み = botToken）", async () => {
    const botMock = createMockWebClient();
    const userMock = createMockWebClient();

    const { WebClient } = await import("@slack/web-api");
    (WebClient as any).mockImplementation(function (token: string) {
      if (token === "xoxb-bot") return botMock;
      if (token === "xoxp-user") return userMock;
      return createMockWebClient();
    });

    const client = new SlamyClient({ botToken: "xoxb-bot", userToken: "xoxp-user" });
    await client.setAssistantStatus("C123", "1700000000.000100", "考えています");

    expect(botMock.assistant.threads.setStatus).toHaveBeenCalledWith({
      channel_id: "C123",
      thread_ts: "1700000000.000100",
      status: "考えています",
    });
    expect(userMock.assistant.threads.setStatus).not.toHaveBeenCalled();
  });

  it("loading_messages 配列を指定できる（Donna 風 rotate 表示）", async () => {
    const client = new SlamyClient({ botToken: "xoxb-bot" });
    await client.setAssistantStatus("C123", "1700000000.000100", "考えています", {
      loadingMessages: ["考えています", "データを見ています", "整理しています"],
    });

    expect(mockWebClient.assistant.threads.setStatus).toHaveBeenCalledWith({
      channel_id: "C123",
      thread_ts: "1700000000.000100",
      status: "考えています",
      loading_messages: ["考えています", "データを見ています", "整理しています"],
    });
  });

  it("空文字 status でクリア指示できる", async () => {
    const client = new SlamyClient({ botToken: "xoxb-bot" });
    await client.setAssistantStatus("C123", "1700000000.000100", "");

    expect(mockWebClient.assistant.threads.setStatus).toHaveBeenCalledWith({
      channel_id: "C123",
      thread_ts: "1700000000.000100",
      status: "",
    });
  });

  it("loading_messages が空配列ならパラメータに含めない", async () => {
    const client = new SlamyClient({ botToken: "xoxb-bot" });
    await client.setAssistantStatus("C123", "1700000000.000100", "...", {
      loadingMessages: [],
    });

    const call = mockWebClient.assistant.threads.setStatus.mock.calls[0][0];
    expect(call).not.toHaveProperty("loading_messages");
  });

  it("API エラーを呼び出し元に伝搬する（フォールバックは呼び出し側責任）", async () => {
    const client = new SlamyClient({ botToken: "xoxb-bot" });
    mockWebClient.assistant.threads.setStatus.mockRejectedValueOnce(
      new Error("missing_scope"),
    );

    await expect(
      client.setAssistantStatus("C123", "1700000000.000100", "..."),
    ).rejects.toThrow("missing_scope");
  });
});

// === Iter 2-改善: branch coverage 70 → 80 のための error path テスト群 ===

describe("resolveUserName — error paths (branch coverage)", () => {
  it("空文字列を渡したらそのまま返す", async () => {
    const client = new SlamyClient({ botToken: "xoxb-1" });
    expect(await client.resolveUserName("")).toBe("");
  });

  it("bot_id で bots.info が成功するとその名前を返す", async () => {
    (mockWebClient as any).bots = {
      info: vi.fn().mockResolvedValue({ ok: true, bot: { name: "my-bot" } }),
    };
    const client = new SlamyClient({ botToken: "xoxb-1" });
    expect(await client.resolveUserName("B12345")).toBe("my-bot");
  });

  it("bot_id で bots.info が失敗したら id 自体を返す", async () => {
    (mockWebClient as any).bots = {
      info: vi.fn().mockRejectedValue(new Error("bot_not_found")),
    };
    const client = new SlamyClient({ botToken: "xoxb-1" });
    expect(await client.resolveUserName("B99999")).toBe("B99999");
  });

  it("bot_id で bots.info が name を返さなければ id 自体を返す", async () => {
    (mockWebClient as any).bots = {
      info: vi.fn().mockResolvedValue({ ok: true, bot: {} }),
    };
    const client = new SlamyClient({ botToken: "xoxb-1" });
    expect(await client.resolveUserName("B11111")).toBe("B11111");
  });

  it("users.list が成功し display_name を最優先で使う", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [
        { id: "U1", profile: { display_name: "Display" }, real_name: "Real", name: "uname" },
      ],
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.resolveUserName("U1")).toBe("Display");
  });

  it("display_name 空時は real_name を優先する", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [
        { id: "U1", profile: { display_name: "" }, real_name: "Real Name", name: "uname" },
      ],
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.resolveUserName("U1")).toBe("Real Name");
  });

  it("users.list がエラーでも users.info にフォールバック", async () => {
    mockWebClient.users.list.mockRejectedValue(new Error("ratelimited"));
    mockWebClient.users.info.mockResolvedValue({
      ok: true,
      user: { id: "U2", name: "fallback-name" },
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.resolveUserName("U2")).toBe("fallback-name");
  });

  it("users.list 後 users.info も失敗すると id 自体を返す", async () => {
    mockWebClient.users.list.mockResolvedValue({ ok: true, members: [] } as any);
    mockWebClient.users.info.mockRejectedValue(new Error("user_not_found"));
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.resolveUserName("U99")).toBe("U99");
  });

  it("users.info が name の無いユーザーを返したら id を返す", async () => {
    mockWebClient.users.list.mockResolvedValue({ ok: true, members: [] } as any);
    mockWebClient.users.info.mockResolvedValue({ ok: true, user: {} } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.resolveUserName("U77")).toBe("U77");
  });

  it("cache hit: 2 回目の呼び出しは users.list を再実行しない", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [{ id: "U1", name: "cached", profile: {} }],
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    await client.resolveUserName("U1");
    await client.resolveUserName("U1");
    expect(mockWebClient.users.list).toHaveBeenCalledTimes(1);
  });

  it("members に id 無しエントリがあってもスキップする", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [{ name: "no-id" }, { id: "U1", name: "ok" }],
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.resolveUserName("U1")).toBe("ok");
  });
});

describe("getChannelInfo — fallback fields", () => {
  it("topic / purpose / num_members が未定義でも安全に default 値で返す", async () => {
    mockWebClient.conversations.info.mockResolvedValue({
      ok: true,
      channel: { id: "C1" },
    } as any);
    const client = new SlamyClient({ botToken: "xoxb-1" });
    expect(await client.getChannelInfo("C1")).toEqual({
      id: "C1",
      name: "",
      topic: "",
      purpose: "",
      num_members: 0,
      is_private: false,
      is_archived: false,
    });
  });

  it("API エラーで throw する", async () => {
    mockWebClient.conversations.info.mockRejectedValue(new Error("channel_not_found"));
    const client = new SlamyClient({ botToken: "xoxb-1" });
    await expect(client.getChannelInfo("Cxxx")).rejects.toThrow("channel_not_found");
  });
});

describe("listChannels — cursor pagination & limit cap", () => {
  it("limit を超えたら早期終了し cursor を追わない", async () => {
    let call = 0;
    mockWebClient.users.conversations.mockImplementation(async () => {
      call++;
      return {
        ok: true,
        channels: Array.from({ length: 5 }, (_, i) => ({ id: `C${call}-${i}`, name: `c${i}` })),
        response_metadata: { next_cursor: call < 3 ? "more" : "" },
      };
    });
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const channels = await client.listChannels({ limit: 5 });
    expect(channels).toHaveLength(5);
    expect(mockWebClient.users.conversations).toHaveBeenCalledTimes(1);
  });

  it("cursor が消えれば pagination ループを抜ける", async () => {
    mockWebClient.users.conversations.mockResolvedValue({
      ok: true,
      channels: [{ id: "C1", name: "a" }],
      response_metadata: { next_cursor: "" },
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.listChannels({ limit: 100 })).toHaveLength(1);
  });
});

describe("listUnreadChannels — Promise.allSettled error tolerance", () => {
  it("個別 channel で API エラーが出ても他チャンネルを返す", async () => {
    mockWebClient.users.conversations.mockResolvedValue({
      ok: true,
      channels: [{ id: "C1", name: "ok" }, { id: "C2", name: "fail" }],
      response_metadata: { next_cursor: "" },
    } as any);
    mockWebClient.conversations.info.mockImplementation(async (args: any) => {
      if (args.channel === "C2") throw new Error("not_in_channel");
      return { ok: true, channel: { id: args.channel, is_member: true, last_read: "100" } };
    });
    mockWebClient.conversations.history.mockResolvedValue({
      ok: true,
      messages: [{ ts: "200.001" }],
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const unread = await client.listUnreadChannels({ limit: 10 });
    expect(unread.map((c) => c.id)).toEqual(["C1"]);
  });

  it("is_member: false のチャンネルは結果から除外", async () => {
    mockWebClient.users.conversations.mockResolvedValue({
      ok: true,
      channels: [{ id: "C1", name: "private" }],
      response_metadata: { next_cursor: "" },
    } as any);
    mockWebClient.conversations.info.mockResolvedValue({
      ok: true,
      channel: { id: "C1", is_member: false },
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.listUnreadChannels({ limit: 10 })).toEqual([]);
  });

  it("history が空のチャンネルは未読 0 として除外", async () => {
    mockWebClient.users.conversations.mockResolvedValue({
      ok: true,
      channels: [{ id: "C1", name: "empty" }],
      response_metadata: { next_cursor: "" },
    } as any);
    mockWebClient.conversations.info.mockResolvedValue({
      ok: true,
      channel: { id: "C1", is_member: true, last_read: "100" },
    } as any);
    mockWebClient.conversations.history.mockResolvedValue({ ok: true, messages: [] } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.listUnreadChannels({ limit: 10 })).toEqual([]);
  });

  it("latestTs <= last_read なら未読なしとして除外", async () => {
    mockWebClient.users.conversations.mockResolvedValue({
      ok: true,
      channels: [{ id: "C1", name: "caught-up" }],
      response_metadata: { next_cursor: "" },
    } as any);
    mockWebClient.conversations.info.mockResolvedValue({
      ok: true,
      channel: { id: "C1", is_member: true, last_read: "300" },
    } as any);
    mockWebClient.conversations.history.mockResolvedValue({
      ok: true,
      messages: [{ ts: "200" }],
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.listUnreadChannels({ limit: 10 })).toEqual([]);
  });
});

describe("uploadFile — branch coverage", () => {
  it("User ID を渡すと conversations.open で DM チャンネルを開く", async () => {
    (mockWebClient.conversations as any).open = vi
      .fn()
      .mockResolvedValue({ ok: true, channel: { id: "D1" } });
    const client = new SlamyClient({ botToken: "xoxb-1" });
    await client.uploadFile("U12345", Buffer.from("hi"));
    expect((mockWebClient.conversations as any).open).toHaveBeenCalledWith({ users: "U12345" });
    expect(mockWebClient.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({ channel_id: "D1" }),
    );
  });

  it("通常 channel ID なら conversations.open を呼ばない", async () => {
    (mockWebClient.conversations as any).open = vi.fn();
    const client = new SlamyClient({ botToken: "xoxb-1" });
    await client.uploadFile("C12345", Buffer.from("hi"));
    expect((mockWebClient.conversations as any).open).not.toHaveBeenCalled();
  });

  it("Buffer 引数 + filename 未指定なら default 'file' を使う", async () => {
    const client = new SlamyClient({ botToken: "xoxb-1" });
    await client.uploadFile("C1", Buffer.from("hi"));
    expect(mockWebClient.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "file", title: "file" }),
    );
  });

  it("文字列パスは basename を filename に使う", async () => {
    const client = new SlamyClient({ botToken: "xoxb-1" });
    await client.uploadFile("C1", "/tmp/path/to/report.pdf");
    expect(mockWebClient.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "report.pdf" }),
    );
  });

  it("threadTs / initialComment / title を渡すと対応キーが含まれる", async () => {
    const client = new SlamyClient({ botToken: "xoxb-1" });
    await client.uploadFile("C1", Buffer.from("x"), {
      threadTs: "1700000000.000100",
      initialComment: "see attached",
      title: "Title",
    });
    expect(mockWebClient.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_ts: "1700000000.000100",
        initial_comment: "see attached",
        title: "Title",
      }),
    );
  });

  it("opts なしなら thread_ts / initial_comment は付与されない", async () => {
    const client = new SlamyClient({ botToken: "xoxb-1" });
    await client.uploadFile("C1", Buffer.from("x"));
    const arg = mockWebClient.files.uploadV2.mock.calls[0]?.[0] as any;
    expect(arg.thread_ts).toBeUndefined();
    expect(arg.initial_comment).toBeUndefined();
  });
});

describe("listReactions — user inference & message filtering", () => {
  it("user 未指定なら auth.test() の user_id を使う", async () => {
    mockWebClient.auth.test.mockResolvedValue({ ok: true, user_id: "U-ME" } as any);
    mockWebClient.reactions.list.mockResolvedValue({
      ok: true,
      items: [],
      response_metadata: { next_cursor: "" },
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    await client.listReactions();
    expect(mockWebClient.auth.test).toHaveBeenCalled();
    expect(mockWebClient.reactions.list).toHaveBeenCalledWith(
      expect.objectContaining({ user: "U-ME" }),
    );
  });

  it("type !== 'message' の item はスキップ", async () => {
    mockWebClient.reactions.list.mockResolvedValue({
      ok: true,
      items: [
        { type: "file", channel: "C1", message: { ts: "1", reactions: [{ name: "x", users: ["U1"] }] } },
        { type: "message", channel: "C2", message: { ts: "2", reactions: [{ name: "y", users: ["U1"] }] } },
      ],
      response_metadata: { next_cursor: "" },
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const result = await client.listReactions({ user: "U1", limit: 100 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toBe("y");
  });

  it("対象ユーザーが付けていない reaction は除外", async () => {
    mockWebClient.reactions.list.mockResolvedValue({
      ok: true,
      items: [
        {
          type: "message",
          channel: "C1",
          message: { ts: "1", reactions: [{ name: "x", users: ["U-OTHER"] }] },
        },
      ],
      response_metadata: { next_cursor: "" },
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const result = await client.listReactions({ user: "U1", limit: 100 });
    expect(result.items).toEqual([]);
  });

  it("100 文字超のメッセージは切り詰めて ... を付ける", async () => {
    const long = "a".repeat(150);
    mockWebClient.reactions.list.mockResolvedValue({
      ok: true,
      items: [
        {
          type: "message",
          channel: "C1",
          message: { ts: "1", text: long, reactions: [{ name: "x", users: ["U1"] }] },
        },
      ],
      response_metadata: { next_cursor: "" },
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const result = await client.listReactions({ user: "U1", limit: 100 });
    expect(result.items[0]?.message_text).toBe("a".repeat(100) + "...");
  });
});

describe("searchMessages — defaults & fallbacks", () => {
  it("オプション未指定なら default 値が渡る", async () => {
    mockWebClient.search.messages.mockResolvedValue({
      ok: true,
      messages: { matches: [], total: 0, paging: { page: 1 } },
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    await client.searchMessages("hello");
    expect(mockWebClient.search.messages).toHaveBeenCalledWith({
      query: "hello",
      sort: "timestamp",
      sort_dir: "desc",
      count: 20,
      page: 1,
    });
  });

  it("matches に channel が無くても空文字で埋める", async () => {
    mockWebClient.search.messages.mockResolvedValue({
      ok: true,
      messages: {
        matches: [{ ts: "1", user: "U1", text: "x" }],
        total: 1,
        paging: { page: 1 },
      },
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const res = await client.searchMessages("x");
    expect(res.matches[0]?.channel).toBe("");
    expect(res.matches[0]?.channel_id).toBe("");
    expect(res.matches[0]?.permalink).toBe("");
  });
});

describe("listUsers — filtering", () => {
  it("default: is_bot と deleted は除外", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [
        { id: "U1", name: "alice", is_bot: false, deleted: false },
        { id: "B1", name: "slackbot", is_bot: true },
        { id: "U2", name: "ex", deleted: true },
      ],
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const users = await client.listUsers();
    expect(users.map((u) => u.id)).toEqual(["U1"]);
  });

  it("includeBots: true で bot を含める", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [{ id: "B1", name: "bot", is_bot: true }],
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const users = await client.listUsers({ includeBots: true });
    expect(users.map((u) => u.id)).toEqual(["B1"]);
  });

  it("includeDeactivated: true で deleted を含める", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [{ id: "U-EX", name: "ex", deleted: true }],
    } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const users = await client.listUsers({ includeDeactivated: true });
    expect(users.map((u) => u.id)).toEqual(["U-EX"]);
  });
});

describe("authTest / getChannelMembers — defaults & pagination", () => {
  it("authTest: 一部フィールドだけ返っても空文字で埋める", async () => {
    mockWebClient.auth.test.mockResolvedValue({ ok: true, user_id: "U1" } as any);
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.authTest()).toEqual({
      user_id: "U1",
      user: "",
      team_id: "",
      team: "",
      url: "",
    });
  });

  it("getChannelMembers: 複数ページにわたって members を集める", async () => {
    let call = 0;
    mockWebClient.conversations.members.mockImplementation(async () => {
      call++;
      return {
        ok: true,
        members: [`U${call}-A`, `U${call}-B`],
        response_metadata: { next_cursor: call < 2 ? "next" : "" },
      };
    });
    const client = new SlamyClient({ userToken: "xoxp-1" });
    expect(await client.getChannelMembers("C1")).toEqual(["U1-A", "U1-B", "U2-A", "U2-B"]);
    expect(mockWebClient.conversations.members).toHaveBeenCalledTimes(2);
  });
});

describe("downloadFileStream — redirect & error", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("HTTP エラーで throw", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      status: 500,
      ok: false,
      headers: { get: () => null },
    });
    const client = new SlamyClient({ userToken: "xoxp-1" });
    await expect(client.downloadFileStream("https://x")).rejects.toThrow(
      "File download failed: HTTP 500",
    );
  });

  it("リダイレクト時に location ヘッダーで再リクエスト", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        status: 302,
        ok: false,
        headers: { get: (k: string) => (k === "location" ? "https://final" : null) },
      })
      .mockResolvedValueOnce({ status: 200, ok: true, headers: { get: () => null } });
    const client = new SlamyClient({ userToken: "xoxp-1" });
    const res = await client.downloadFileStream("https://x");
    expect((res as any).status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("リダイレクトでも location 無ければそのまま返してエラーチェックへ", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: { get: () => null },
    });
    const client = new SlamyClient({ userToken: "xoxp-1" });
    await expect(client.downloadFileStream("https://x")).rejects.toThrow(
      "File download failed: HTTP 302",
    );
  });
});


describe("getTeamInfo", () => {
  it("team.info の結果を TeamInfo にマップする", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const info = await client.getTeamInfo();
    expect(info.id).toBe("T123");
    expect(info.name).toBe("TestTeam");
    expect(info.domain).toBe("testteam");
    expect(info.email_domain).toBe("example.com");
    expect(info.icon).toBe("https://test/icon.png");
  });

  it("欠損フィールドは空文字になる", async () => {
    mockWebClient.team.info.mockResolvedValueOnce({ ok: true, team: { id: "T1" } });
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const info = await client.getTeamInfo();
    expect(info.id).toBe("T1");
    expect(info.name).toBe("");
    expect(info.email_domain).toBe("");
    expect(info.enterprise_id).toBe("");
    expect(info.icon).toBe("");
  });
});
