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

describe("resolveChannelName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("conversations.list を 1 回だけ呼び、cache から名前を返す", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.list.mockResolvedValue({
      ok: true,
      channels: [
        { id: "C001", name: "general" },
        { id: "C002", name: "random" },
      ],
    } as any);

    const r1 = await client.resolveChannelName("C001");
    const r2 = await client.resolveChannelName("C002");
    const r3 = await client.resolveChannelName("C001");

    expect(r1).toBe("general");
    expect(r2).toBe("random");
    expect(r3).toBe("general");
    expect(mock.conversations.list).toHaveBeenCalledTimes(1);
  });

  it("cache miss 時は conversations.info で取得して cache に追加", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.list.mockResolvedValue({ ok: true, channels: [] } as any);
    mock.conversations.info.mockResolvedValue({
      ok: true,
      channel: { id: "C999", name: "missed-channel" },
    } as any);

    const r1 = await client.resolveChannelName("C999");
    const r2 = await client.resolveChannelName("C999");

    expect(r1).toBe("missed-channel");
    expect(r2).toBe("missed-channel");
    expect(mock.conversations.info).toHaveBeenCalledTimes(1);
  });

  it("解決失敗時は channel_id をそのまま返す", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.list.mockResolvedValue({ ok: true, channels: [] } as any);
    mock.conversations.info.mockRejectedValue(new Error("channel_not_found"));

    const result = await client.resolveChannelName("C_MISSING");
    expect(result).toBe("C_MISSING");
  });

  it("空文字列はそのまま返す", async () => {
    const { client } = await makeClient();
    expect(await client.resolveChannelName("")).toBe("");
  });

  it("並列呼び出し時も conversations.list は 1 回しか呼ばれない (race condition 防止)", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.list.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                channels: [
                  { id: "C001", name: "general" },
                  { id: "C002", name: "random" },
                ],
              } as any),
            10,
          ),
        ),
    );

    const [r1, r2, r3] = await Promise.all([
      client.resolveChannelName("C001"),
      client.resolveChannelName("C002"),
      client.resolveChannelName("C001"),
    ]);

    expect(r1).toBe("general");
    expect(r2).toBe("random");
    expect(r3).toBe("general");
    expect(mock.conversations.list).toHaveBeenCalledTimes(1);
  });

  it("resolveChannelNames で batch 解決 (conversations.list は 1 回)", async () => {
    const { client, mock } = await makeClient();
    mock.conversations.list.mockResolvedValue({
      ok: true,
      channels: [
        { id: "C001", name: "general" },
        { id: "C002", name: "random" },
        { id: "C003", name: "dev" },
      ],
    } as any);

    const result = await client.resolveChannelNames(["C001", "C002", "C003"]);
    expect(result.get("C001")).toBe("general");
    expect(result.get("C002")).toBe("random");
    expect(result.get("C003")).toBe("dev");
    expect(mock.conversations.list).toHaveBeenCalledTimes(1);
  });
});
