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
  (WebClient as any).mockImplementation(() => mock);
  const client = new SlamyClient({ botToken: "xoxb-test", userToken: "xoxp-test" });
  return { client, mock };
}

describe("getMessageReactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reactions.get を呼び出して reactions 配列を返す", async () => {
    const { client, mock } = await makeClient();
    (mock as any).reactions.get = vi.fn().mockResolvedValue({
      ok: true,
      type: "message",
      channel: "C123",
      message: {
        text: "hello",
        ts: "1700000000.000001",
        reactions: [
          { name: "thumbsup", count: 3, users: ["U001", "U002", "U003"] },
          { name: "heart", count: 1, users: ["U001"] },
        ],
      },
    });

    const result = await client.getMessageReactions("C123", "1700000000.000001");

    expect((mock as any).reactions.get).toHaveBeenCalledWith({
      channel: "C123",
      timestamp: "1700000000.000001",
      full: true,
    });
    expect(result).toEqual([
      { name: "thumbsup", count: 3, users: ["U001", "U002", "U003"] },
      { name: "heart", count: 1, users: ["U001"] },
    ]);
  });

  it("reactions が無いメッセージは空配列を返す", async () => {
    const { client, mock } = await makeClient();
    (mock as any).reactions.get = vi.fn().mockResolvedValue({
      ok: true,
      type: "message",
      channel: "C123",
      message: { text: "no reactions", ts: "1700000000.000001" },
    });

    const result = await client.getMessageReactions("C123", "1700000000.000001");
    expect(result).toEqual([]);
  });

  it("メッセージが見つからない場合は空配列を返す (defensive)", async () => {
    const { client, mock } = await makeClient();
    (mock as any).reactions.get = vi.fn().mockResolvedValue({
      ok: true,
      type: "message",
      channel: "C123",
    });

    const result = await client.getMessageReactions("C123", "1700000000.000001");
    expect(result).toEqual([]);
  });

  it("users 配列が無い reaction は users:[] で正規化", async () => {
    const { client, mock } = await makeClient();
    (mock as any).reactions.get = vi.fn().mockResolvedValue({
      ok: true,
      message: {
        ts: "1700000000.000001",
        reactions: [{ name: "wave", count: 1 }],
      },
    });

    const result = await client.getMessageReactions("C123", "1700000000.000001");
    expect(result).toEqual([{ name: "wave", count: 1, users: [] }]);
  });
});
