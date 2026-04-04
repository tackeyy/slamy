import { describe, it, expect, vi } from "vitest";
import { SlamyClient } from "../lib/client.js";
import { createMockWebClient } from "./helpers/mock-slack.js";

vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn().mockImplementation(() => createMockWebClient()),
  LogLevel: { ERROR: "error", WARN: "warn", INFO: "info", DEBUG: "debug" },
}));

async function createClient(token = "xoxb-test") {
  const mock = createMockWebClient();
  const { WebClient } = vi.mocked(await import("@slack/web-api"));
  (WebClient as any).mockImplementation(() => mock);
  const client = new SlamyClient({ botToken: token });
  return { client, mock };
}

// テスト用エポック計算ヘルパー（UTC）
function epoch(isoStr: string): number {
  return new Date(isoStr).getTime() / 1000;
}

describe("getUserEngagement", () => {
  it("search.messages に正しいクエリが渡される", async () => {
    const { client, mock } = await createClient();
    mock.search.messages.mockResolvedValue({
      ok: true,
      messages: { matches: [], total: 15, paging: { page: 1 } },
    } as any);
    mock.reactions.list.mockResolvedValue({
      ok: true,
      items: [],
      response_metadata: { next_cursor: "" },
    } as any);

    const result = await client.getUserEngagement("U_TARGET", { since: "2026-03-20" });

    // after: は since の1日前（Slack の after: は exclusive）
    expect(mock.search.messages).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "from:<@U_TARGET> after:2026-03-19",
        count: 1,
      }),
    );
    expect(result.postCount).toBe(15);
    expect(result.userId).toBe("U_TARGET");
    expect(result.since).toBe("2026-03-20");
    expect(result.until).toBe("2026-03-20");
    expect(result.reactionGivenCount).toBe(0);
    expect(result.fetchedAt).toBeTruthy();
  });

  it("until 指定時に before: がクエリに付く", async () => {
    const { client, mock } = await createClient();
    mock.search.messages.mockResolvedValue({
      ok: true,
      messages: { matches: [], total: 5, paging: { page: 1 } },
    } as any);
    mock.reactions.list.mockResolvedValue({
      ok: true,
      items: [],
      response_metadata: { next_cursor: "" },
    } as any);

    const result = await client.getUserEngagement("U1", {
      since: "2026-03-17",
      until: "2026-03-21",
    });

    // before: は until の翌日（Slack の before: は exclusive）
    expect(mock.search.messages).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "from:<@U1> after:2026-03-16 before:2026-03-22",
      }),
    );
    expect(result.postCount).toBe(5);
    expect(result.until).toBe("2026-03-21");
  });

  it("reactions.list の日付フィルタ: since 以前のアイテムは除外（早期終了しない）", async () => {
    const { client, mock } = await createClient();
    mock.search.messages.mockResolvedValue({
      ok: true,
      messages: { matches: [], total: 0, paging: { page: 1 } },
    } as any);

    const sinceEpoch = epoch("2026-03-20T00:00:00Z");
    const oldTs = String(sinceEpoch - 3600); // since の1時間前
    const newTs = String(sinceEpoch + 3600); // since の1時間後

    // ページ1: 古いメッセージが先に来るケース（リアクション付与日時順）
    mock.reactions.list
      .mockResolvedValueOnce({
        ok: true,
        items: [
          {
            type: "message",
            message: {
              text: "Old msg reacted recently",
              ts: oldTs,
              reactions: [{ name: "ng", count: 1, users: ["U1"] }],
            },
            channel: "C2",
          },
        ],
        response_metadata: { next_cursor: "page2" },
      } as any)
      // ページ2: 範囲内のメッセージ
      .mockResolvedValueOnce({
        ok: true,
        items: [
          {
            type: "message",
            message: {
              text: "New msg",
              ts: newTs,
              reactions: [{ name: "ok", count: 1, users: ["U1"] }],
            },
            channel: "C1",
          },
        ],
        response_metadata: { next_cursor: "" },
      } as any);

    const result = await client.getUserEngagement("U1", { since: "2026-03-20" });

    // 古いメッセージで早期終了せず、2ページ目も取得する
    expect(mock.reactions.list).toHaveBeenCalledTimes(2);
    // 範囲内のメッセージだけカウント
    expect(result.reactionGivenCount).toBe(1);
  });

  it("reactions.list のページ上限で打ち切り", async () => {
    const { client, mock } = await createClient();
    mock.search.messages.mockResolvedValue({
      ok: true,
      messages: { matches: [], total: 0, paging: { page: 1 } },
    } as any);

    const validTs = String(epoch("2026-03-20T12:00:00Z"));

    // 無限にカーソルが続くケース → MAX_REACTION_PAGES で打ち切り
    mock.reactions.list.mockResolvedValue({
      ok: true,
      items: [
        {
          type: "message",
          message: { text: "msg", ts: validTs, reactions: [{ name: "ok", count: 1, users: ["U1"] }] },
          channel: "C1",
        },
      ],
      response_metadata: { next_cursor: "infinite_cursor" },
    } as any);

    const result = await client.getUserEngagement("U1", { since: "2026-03-20" });

    // MAX_REACTION_PAGES (10) で打ち切り
    expect(mock.reactions.list).toHaveBeenCalledTimes(10);
    expect(result.reactionGivenCount).toBe(10);
  });

  it("reactions.list の日付フィルタ: until 以降のアイテムは除外", async () => {
    const { client, mock } = await createClient();
    mock.search.messages.mockResolvedValue({
      ok: true,
      messages: { matches: [], total: 0, paging: { page: 1 } },
    } as any);

    const untilEndEpoch = epoch("2026-03-21T23:59:59Z");
    const inRangeTs = String(epoch("2026-03-20T12:00:00Z"));
    const afterUntilTs = String(untilEndEpoch + 3600); // until の1時間後

    mock.reactions.list.mockResolvedValue({
      ok: true,
      items: [
        {
          type: "message",
          message: {
            text: "Future msg",
            ts: afterUntilTs,
            reactions: [{ name: "skip", count: 1, users: ["U1"] }],
          },
          channel: "C1",
        },
        {
          type: "message",
          message: {
            text: "In range msg",
            ts: inRangeTs,
            reactions: [{ name: "ok", count: 1, users: ["U1"] }],
          },
          channel: "C2",
        },
      ],
      response_metadata: { next_cursor: "" },
    } as any);

    const result = await client.getUserEngagement("U1", {
      since: "2026-03-20",
      until: "2026-03-21",
    });

    // until 以降のアイテムは除外
    expect(result.reactionGivenCount).toBe(1);
  });

  it("リアクション0件で reactionGivenCount: 0", async () => {
    const { client, mock } = await createClient();
    mock.search.messages.mockResolvedValue({
      ok: true,
      messages: { matches: [], total: 3, paging: { page: 1 } },
    } as any);
    mock.reactions.list.mockResolvedValue({
      ok: true,
      items: [],
      response_metadata: { next_cursor: "" },
    } as any);

    const result = await client.getUserEngagement("U1", { since: "2026-03-20" });

    expect(result.reactionGivenCount).toBe(0);
    expect(result.postCount).toBe(3);
  });

  it("cursor ページネーション（複数ページ）", async () => {
    const { client, mock } = await createClient();
    mock.search.messages.mockResolvedValue({
      ok: true,
      messages: { matches: [], total: 0, paging: { page: 1 } },
    } as any);

    const validTs = String(epoch("2026-03-20T12:00:00Z"));

    mock.reactions.list
      .mockResolvedValueOnce({
        ok: true,
        items: [
          {
            type: "message",
            message: {
              text: "Page1",
              ts: validTs,
              reactions: [{ name: "a", count: 1, users: ["U1"] }],
            },
            channel: "C1",
          },
        ],
        response_metadata: { next_cursor: "cursor_page2" },
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        items: [
          {
            type: "message",
            message: {
              text: "Page2",
              ts: validTs,
              reactions: [{ name: "b", count: 1, users: ["U1"] }],
            },
            channel: "C2",
          },
        ],
        response_metadata: { next_cursor: "" },
      } as any);

    const result = await client.getUserEngagement("U1", { since: "2026-03-20" });

    expect(mock.reactions.list).toHaveBeenCalledTimes(2);
    expect(mock.reactions.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "cursor_page2" }),
    );
    expect(result.reactionGivenCount).toBe(2);
  });

  it("同メッセージに複数絵文字でも1カウント", async () => {
    const { client, mock } = await createClient();
    mock.search.messages.mockResolvedValue({
      ok: true,
      messages: { matches: [], total: 0, paging: { page: 1 } },
    } as any);

    const validTs = String(epoch("2026-03-20T12:00:00Z"));

    mock.reactions.list.mockResolvedValue({
      ok: true,
      items: [
        {
          type: "message",
          message: {
            text: "Multi reaction",
            ts: validTs,
            reactions: [
              { name: "thumbsup", count: 1, users: ["U1"] },
              { name: "heart", count: 1, users: ["U1"] },
              { name: "fire", count: 1, users: ["U1"] },
            ],
          },
          channel: "C1",
        },
      ],
      response_metadata: { next_cursor: "" },
    } as any);

    const result = await client.getUserEngagement("U1", { since: "2026-03-20" });

    // 同メッセージに複数絵文字 = 1カウント
    expect(result.reactionGivenCount).toBe(1);
  });
});
