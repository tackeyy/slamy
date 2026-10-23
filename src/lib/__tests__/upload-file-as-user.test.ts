import { describe, it, expect, vi, beforeEach } from "vitest";
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

/** トークン文字列に応じて bot / user の別モックを返す構成。トークン分離の検証に使う。 */
async function createTokenSeparatedMocks() {
  const botMock = createMockWebClient();
  const userMock = createMockWebClient();

  const { WebClient } = await import("@slack/web-api");
  (WebClient as any).mockImplementation(function (token: string) {
    if (token === "xoxb-bot") return botMock;
    if (token === "xoxp-user") return userMock;
    return createMockWebClient();
  });

  const client = new SlamyClient({ botToken: "xoxb-bot", userToken: "xoxp-user" });
  return { client, botMock, userMock };
}

describe("uploadFile — asUser", () => {
  it("--as-user なし: botClient の uploadV2 が呼ばれ、userClient のは呼ばれない", async () => {
    const { client, botMock, userMock } = await createTokenSeparatedMocks();

    await client.uploadFile("C123", Buffer.from("data"), { filename: "f.txt" });

    expect(botMock.files.uploadV2).toHaveBeenCalledTimes(1);
    expect(userMock.files.uploadV2).not.toHaveBeenCalled();
  });

  it("--as-user なし: 宛先が User ID でも conversations.open は botClient で呼ばれる", async () => {
    const { client, botMock, userMock } = await createTokenSeparatedMocks();
    (botMock.conversations as any).open = vi
      .fn()
      .mockResolvedValue({ ok: true, channel: { id: "D123" } });
    (userMock.conversations as any).open = vi.fn();

    await client.uploadFile("U12345", Buffer.from("data"));

    expect(botMock.conversations.open).toHaveBeenCalledWith({ users: "U12345" });
    expect(userMock.conversations.open).not.toHaveBeenCalled();
    expect(botMock.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({ channel_id: "D123" }),
    );
    expect(userMock.files.uploadV2).not.toHaveBeenCalled();
  });

  it("--as-user あり: userClient の uploadV2 が呼ばれ、botClient のは呼ばれない", async () => {
    const { client, botMock, userMock } = await createTokenSeparatedMocks();

    await client.uploadFile("C123", Buffer.from("data"), {
      asUser: true,
      threadTs: "1700000000.000100",
      initialComment: "here you go",
      filename: "report.pdf",
    });

    expect(userMock.files.uploadV2).toHaveBeenCalledTimes(1);
    expect(userMock.files.uploadV2).toHaveBeenCalledWith({
      channel_id: "C123",
      file: Buffer.from("data"),
      filename: "report.pdf",
      title: "report.pdf",
      thread_ts: "1700000000.000100",
      initial_comment: "here you go",
    });
    expect(botMock.files.uploadV2).not.toHaveBeenCalled();
  });

  it("--as-user あり: 宛先が User ID の場合 conversations.open も userClient で呼ばれる", async () => {
    const { client, botMock, userMock } = await createTokenSeparatedMocks();
    (userMock.conversations as any).open = vi
      .fn()
      .mockResolvedValue({ ok: true, channel: { id: "D999" } });
    (botMock.conversations as any).open = vi.fn();

    await client.uploadFile("U12345", Buffer.from("data"), {
      asUser: true,
      filename: "report.pdf",
    });

    expect(userMock.conversations.open).toHaveBeenCalledWith({ users: "U12345" });
    expect(botMock.conversations.open).not.toHaveBeenCalled();
    expect(userMock.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({ channel_id: "D999" }),
    );
    expect(botMock.files.uploadV2).not.toHaveBeenCalled();
  });

  it("--as-user あり・user token なし: エラーになり、どちらの uploadV2 も呼ばれない", async () => {
    const botMock = createMockWebClient();
    const userMock = createMockWebClient();

    const { WebClient } = await import("@slack/web-api");
    (WebClient as any).mockImplementation(function (token: string) {
      if (token === "xoxb-bot") return botMock;
      if (token === "xoxp-user") return userMock;
      return createMockWebClient();
    });

    const client = new SlamyClient({ botToken: "xoxb-bot" });

    await expect(
      client.uploadFile("C123", Buffer.from("data"), { asUser: true }),
    ).rejects.toThrow("--as-user requires a user token");

    expect(botMock.files.uploadV2).not.toHaveBeenCalled();
    expect(userMock.files.uploadV2).not.toHaveBeenCalled();
  });

  it("asUser が undefined のときは従来どおり botClient で動く", async () => {
    const { client, botMock, userMock } = await createTokenSeparatedMocks();

    await client.uploadFile("C123", "/path/to/file.pdf");

    expect(botMock.files.uploadV2).toHaveBeenCalledTimes(1);
    expect(userMock.files.uploadV2).not.toHaveBeenCalled();
    expect(botMock.files.uploadV2).toHaveBeenCalledWith({
      channel_id: "C123",
      file: Buffer.from("file content"),
      filename: "file.pdf",
      title: "file.pdf",
    });
  });
});
