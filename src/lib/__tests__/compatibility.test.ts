import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlamyClient } from "../client.js";
import { createMockWebClient } from "../../__tests__/helpers/mock-slack.js";

// Mock @slack/web-api
vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(),
}));

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

describe("Go版JSON互換性テスト", () => {
  it("messages post --json のキー名が { channel, ts } であること", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const result = await client.postMessage("C123", "test");

    expect(result).toHaveProperty("channel");
    expect(result).toHaveProperty("ts");
    expect(typeof result.channel).toBe("string");
    expect(typeof result.ts).toBe("string");
  });

  it("messages reply --json のキー名が { channel, ts } であること", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const result = await client.replyToThread("C123", "ts123", "reply");

    expect(result).toHaveProperty("channel");
    expect(result).toHaveProperty("ts");
  });

  it("channels list --json のキー名がGo版と一致すること", async () => {
    mockWebClient.users.conversations.mockResolvedValue({
      ok: true,
      channels: [
        {
          id: "C1",
          name: "general",
          topic: { value: "Topic" },
          purpose: { value: "Purpose" },
          num_members: 5,
          is_private: false,
          is_archived: false,
        },
      ],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const channels = await client.listChannels();

    const ch = channels[0];
    expect(ch).toHaveProperty("id");
    expect(ch).toHaveProperty("name");
    expect(ch).toHaveProperty("topic");
    expect(ch).toHaveProperty("purpose");
    expect(ch).toHaveProperty("num_members");
    expect(ch).toHaveProperty("is_private");
    expect(ch).toHaveProperty("is_archived");
  });

  it("channels history --json のキー名がGo版と一致すること", async () => {
    mockWebClient.conversations.history.mockResolvedValue({
      ok: true,
      messages: [
        { ts: "123.456", user: "U1", text: "Hello", thread_ts: "123.456", reply_count: 2 },
      ],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const msgs = await client.getChannelHistory("C123");

    const msg = msgs[0];
    expect(msg).toHaveProperty("ts");
    expect(msg).toHaveProperty("user");
    expect(msg).toHaveProperty("text");
    expect(msg).toHaveProperty("thread_ts");
    expect(msg).toHaveProperty("reply_count");
  });

  it("threads replies --json のキー名がGo版と一致すること", async () => {
    mockWebClient.conversations.replies.mockResolvedValue({
      ok: true,
      messages: [{ ts: "123.456", user: "U1", text: "Reply" }],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const msgs = await client.getThreadReplies("C123", "123.456");

    const msg = msgs[0];
    expect(msg).toHaveProperty("ts");
    expect(msg).toHaveProperty("user");
    expect(msg).toHaveProperty("text");
  });

  it("users list --json のキー名がGo版と一致すること", async () => {
    mockWebClient.users.list.mockResolvedValue({
      ok: true,
      members: [
        {
          id: "U1",
          name: "user1",
          real_name: "User One",
          profile: { display_name: "u1", email: "u1@test.com" },
          is_bot: false,
          deleted: false,
        },
      ],
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const users = await client.listUsers();

    const u = users[0];
    expect(u).toHaveProperty("id");
    expect(u).toHaveProperty("name");
    expect(u).toHaveProperty("real_name");
    expect(u).toHaveProperty("display_name");
    expect(u).toHaveProperty("is_bot");
    expect(u).toHaveProperty("deleted");
  });

  it("users profile --json のキー名がGo版と一致すること", async () => {
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
        is_admin: true,
        is_bot: false,
        deleted: false,
      },
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const profile = await client.getUserProfile("U1");

    for (const key of [
      "id",
      "name",
      "real_name",
      "display_name",
      "email",
      "title",
      "phone",
      "status_text",
      "status_emoji",
      "tz",
      "is_admin",
      "is_bot",
      "deleted",
    ]) {
      expect(profile).toHaveProperty(key);
    }
  });

  it("search messages --json のキー名がGo版と一致すること", async () => {
    mockWebClient.search.messages.mockResolvedValue({
      ok: true,
      messages: {
        matches: [
          {
            ts: "123.456",
            channel: { id: "C1", name: "general" },
            user: "U1",
            text: "Hello",
            permalink: "https://slack.com/test",
          },
        ],
        total: 1,
        paging: { page: 1 },
      },
    });

    const client = new SlamyClient({ userToken: "xoxp-test" });
    const result = await client.searchMessages("Hello");

    expect(result).toHaveProperty("matches");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page");

    const m = result.matches[0];
    expect(m).toHaveProperty("ts");
    expect(m).toHaveProperty("channel");
    expect(m).toHaveProperty("channel_id");
    expect(m).toHaveProperty("user");
    expect(m).toHaveProperty("text");
    expect(m).toHaveProperty("permalink");
  });

  it("auth test --json のキー名がGo版と一致すること", async () => {
    const client = new SlamyClient({ userToken: "xoxp-test" });
    const info = await client.authTest();

    expect(info).toHaveProperty("user_id");
    expect(info).toHaveProperty("user");
    expect(info).toHaveProperty("team_id");
    expect(info).toHaveProperty("team");
    expect(info).toHaveProperty("url");
  });
});
