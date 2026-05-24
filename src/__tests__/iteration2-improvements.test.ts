import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlamyClient } from "../lib/client.js";
import { createMockWebClient } from "./helpers/mock-slack.js";
import { CHAT_POSTMESSAGE_MAX_LENGTH } from "../lib/split.js";

vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(),
  LogLevel: { DEBUG: "debug", INFO: "info", WARN: "warn", ERROR: "error" },
}));

async function makeClient() {
  const mock = createMockWebClient();
  const { WebClient } = vi.mocked(await import("@slack/web-api"));
  (WebClient as any).mockImplementation(() => mock);
  const client = new SlamyClient({ botToken: "xoxb-test", userToken: "xoxp-test" });
  return { client, mock };
}

describe("scheduleMessage 上限を CHAT_POSTMESSAGE_MAX_LENGTH (40000) に拡張", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("5000 文字でも成功する (旧 3900 制限なら例外だった)", async () => {
    const { client, mock } = await makeClient();
    await client.scheduleMessage("C123", "a".repeat(5000), 1700000000);
    expect(mock.chat.scheduleMessage).toHaveBeenCalledTimes(1);
  });

  it("40000 文字までは成功する", async () => {
    const { client, mock } = await makeClient();
    await client.scheduleMessage("C123", "b".repeat(CHAT_POSTMESSAGE_MAX_LENGTH), 1700000000);
    expect(mock.chat.scheduleMessage).toHaveBeenCalledTimes(1);
  });

  it("40001 文字は例外 (1 chunk 制限)", async () => {
    const { client } = await makeClient();
    await expect(
      client.scheduleMessage("C123", "c".repeat(40001), 1700000000),
    ).rejects.toThrow(/40000/);
  });
});

describe("resolveUserName の race condition 修正", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("並列呼び出し時も users.list は 1 回しか呼ばれない", async () => {
    const { client, mock } = await makeClient();
    // users.list を遅延させる (await の間に並列呼び出しが入る状況を再現)
    mock.users.list.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                members: [
                  { id: "U001", profile: { display_name: "Alice" } },
                  { id: "U002", profile: { display_name: "Bob" } },
                ],
              } as any),
            10,
          ),
        ),
    );

    const [r1, r2, r3] = await Promise.all([
      client.resolveUserName("U001"),
      client.resolveUserName("U002"),
      client.resolveUserName("U001"),
    ]);

    expect(r1).toBe("Alice");
    expect(r2).toBe("Bob");
    expect(r3).toBe("Alice");
    expect(mock.users.list).toHaveBeenCalledTimes(1); // ★ ここが核心
  });
});

describe("getMessageReactions が message_text を返す", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("戻り値オブジェクトに message_text が含まれる (元メッセージ追跡用)", async () => {
    const { client, mock } = await makeClient();
    (mock as any).reactions.get = vi.fn().mockResolvedValue({
      ok: true,
      message: {
        text: "Hello world",
        ts: "1700000000.000001",
        reactions: [{ name: "thumbsup", count: 1, users: ["U001"] }],
      },
    });

    const result = await client.getMessageReactionsDetail("C123", "1700000000.000001");
    expect(result.message_text).toBe("Hello world");
    expect(result.reactions).toEqual([
      { name: "thumbsup", count: 1, users: ["U001"] },
    ]);
  });

  it("message が無い場合は message_text は空文字", async () => {
    const { client, mock } = await makeClient();
    (mock as any).reactions.get = vi.fn().mockResolvedValue({ ok: true });
    const result = await client.getMessageReactionsDetail("C123", "1700000000.000001");
    expect(result.message_text).toBe("");
    expect(result.reactions).toEqual([]);
  });
});
