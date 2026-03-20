import { describe, it, expect, vi } from "vitest";
import { SlamyClient } from "../lib/client.js";
import { createMockWebClient } from "./helpers/mock-slack.js";

vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn().mockImplementation(() => createMockWebClient()),
}));

async function createClient(token = "xoxb-test") {
  const mock = createMockWebClient();
  const { WebClient } = vi.mocked(await import("@slack/web-api"));
  (WebClient as any).mockImplementation(() => mock);
  const client = new SlamyClient({ botToken: token });
  return { client, mock };
}

describe("listReactions", () => {
  it("reactions.list を呼び出してアイテムを返す", async () => {
    // Arrange
    const { client, mock } = await createClient();
    mock.reactions.list.mockResolvedValue({
      ok: true,
      items: [
        {
          type: "message",
          message: {
            type: "message",
            text: "Hello world",
            ts: "1700000000.000001",
            reactions: [{ name: "thumbsup", count: 1, users: ["U123"] }],
          },
          channel: "C001",
        },
        {
          type: "message",
          message: {
            type: "message",
            text: "Another message with a very long text that should be truncated at 100 characters for display purposes in the output",
            ts: "1700000001.000001",
            reactions: [{ name: "heart", count: 1, users: ["U123"] }],
          },
          channel: "C002",
        },
      ],
      response_metadata: { next_cursor: "" },
    } as any);

    // Act
    const result = await client.listReactions({ user: "U123", limit: 10 });

    // Assert
    expect(mock.reactions.list).toHaveBeenCalledWith({
      user: "U123",
      limit: 10,
      cursor: undefined,
      full: true,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      name: "thumbsup",
      channel: "C001",
      timestamp: "1700000000.000001",
      message_text: "Hello world",
    });
    // 長いテキストは100文字でtruncate
    expect(result.items[1].message_text.length).toBeLessThanOrEqual(103); // "..." 含む
    expect(result.total).toBe(2);
  });

  it("user が省略された場合は auth.test で自分のIDを取得して渡す", async () => {
    // Arrange
    const { client, mock } = await createClient();
    mock.auth.test.mockResolvedValue({
      ok: true,
      user_id: "U_SELF",
      user: "selfuser",
      team_id: "T123",
      team: "TestTeam",
      url: "https://test.slack.com",
    } as any);
    mock.reactions.list.mockResolvedValue({
      ok: true,
      items: [],
      response_metadata: { next_cursor: "" },
    } as any);

    // Act
    await client.listReactions({ limit: 5 });

    // Assert
    expect(mock.auth.test).toHaveBeenCalled();
    expect(mock.reactions.list).toHaveBeenCalledWith(
      expect.objectContaining({ user: "U_SELF" }),
    );
  });

  it("cursor ページネーションで複数ページを全件取得する", async () => {
    // Arrange
    const { client, mock } = await createClient();
    mock.reactions.list
      .mockResolvedValueOnce({
        ok: true,
        items: [
          {
            type: "message",
            message: { text: "Page1", ts: "1.1", reactions: [{ name: "wave", count: 1, users: ["U1"] }] },
            channel: "C1",
          },
        ],
        response_metadata: { next_cursor: "cursor_abc" },
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        items: [
          {
            type: "message",
            message: { text: "Page2", ts: "2.2", reactions: [{ name: "fire", count: 1, users: ["U1"] }] },
            channel: "C2",
          },
        ],
        response_metadata: { next_cursor: "" },
      } as any);

    // Act
    const result = await client.listReactions({ user: "U1", limit: 200 });

    // Assert
    expect(mock.reactions.list).toHaveBeenCalledTimes(2);
    expect(mock.reactions.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "cursor_abc" }));
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe("wave");
    expect(result.items[1].name).toBe("fire");
    expect(result.total).toBe(2);
  });

  it("limit に達した時点でページネーションを停止する", async () => {
    // Arrange
    const { client, mock } = await createClient();
    mock.reactions.list.mockResolvedValueOnce({
      ok: true,
      items: [
        {
          type: "message",
          message: { text: "Msg1", ts: "1.1", reactions: [{ name: "ok", count: 1, users: ["U1"] }] },
          channel: "C1",
        },
        {
          type: "message",
          message: { text: "Msg2", ts: "2.2", reactions: [{ name: "ng", count: 1, users: ["U1"] }] },
          channel: "C1",
        },
        {
          type: "message",
          message: { text: "Msg3", ts: "3.3", reactions: [{ name: "plus1", count: 1, users: ["U1"] }] },
          channel: "C1",
        },
      ],
      response_metadata: { next_cursor: "more" },
    } as any);

    // Act
    const result = await client.listReactions({ user: "U1", limit: 2 });

    // Assert — limit=2 なので2件で止まり、2ページ目は呼ばれない
    expect(result.items).toHaveLength(2);
    expect(mock.reactions.list).toHaveBeenCalledTimes(1);
  });

  it("message 以外の type（file, file_comment）は除外する", async () => {
    // Arrange
    const { client, mock } = await createClient();
    mock.reactions.list.mockResolvedValue({
      ok: true,
      items: [
        {
          type: "file",
          file: { name: "somefile.pdf" },
        },
        {
          type: "message",
          message: { text: "Valid", ts: "1.1", reactions: [{ name: "check", count: 1, users: ["U1"] }] },
          channel: "C1",
        },
      ],
      response_metadata: { next_cursor: "" },
    } as any);

    // Act
    const result = await client.listReactions({ user: "U1", limit: 10 });

    // Assert
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("check");
  });
});
