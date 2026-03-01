import { describe, it, expect, vi, afterEach } from "vitest";
import { SlamyClient } from "../lib/client.js";
import { createMockWebClient } from "./helpers/mock-slack.js";

// WebClient コンストラクタをモック
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

const FILE_FIXTURE = { id: "F123", name: "doc.pdf", mimetype: "application/pdf", filetype: "pdf", size: 1024, url_private_download: "https://files.slack.com/doc.pdf" };

describe("getMessageAt", () => {
  it("指定 channel/ts のメッセージを1件取得し files フィールド付きで返す", async () => {
    // Arrange
    const { client, mock } = await createClient();
    const files = [FILE_FIXTURE];
    mock.conversations.history.mockResolvedValue({
      ok: true,
      messages: [{ ts: "1234567890.123456", user: "U123", text: "hello", files }],
    } as any);

    // Act
    const result = await client.getMessageAt("C123", "1234567890.123456");

    // Assert
    expect(mock.conversations.history).toHaveBeenCalledWith({
      channel: "C123",
      oldest: "1234567890.123456",
      latest: "1234567890.123456",
      inclusive: true,
      limit: 1,
    });
    expect(result).toEqual([{
      ts: "1234567890.123456",
      user: "U123",
      text: "hello",
      thread_ts: undefined,
      reply_count: undefined,
      files,
    }]);
  });

  it("メッセージが0件の場合に空配列を返す", async () => {
    // Arrange
    const { client, mock } = await createClient();
    mock.conversations.history.mockResolvedValue({ ok: true, messages: [] } as any);

    // Act
    const result = await client.getMessageAt("C123", "9999999999.999999");

    // Assert
    expect(result).toEqual([]);
  });
});

describe("downloadFileStream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Slack ファイル URL から Response を返す", async () => {
    // Arrange
    const { client } = await createClient("xoxb-test-token");
    const mockResponse = { ok: true, status: 200 } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    // Act
    const result = await client.downloadFileStream("https://files.slack.com/files-pri/T123/doc.pdf");

    // Assert
    expect(global.fetch).toHaveBeenCalledWith("https://files.slack.com/files-pri/T123/doc.pdf", {
      headers: { Authorization: "Bearer xoxb-test-token" },
      redirect: "error",
    });
    expect(result).toBe(mockResponse);
  });

  it("HTTP エラー時にエラーを throw する", async () => {
    // Arrange
    const { client } = await createClient("xoxb-test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response));

    // Act & Assert
    await expect(client.downloadFileStream("https://files.slack.com/doc.pdf"))
      .rejects.toThrow("File download failed: HTTP 403");
  });
});

describe("getChannelHistory — files フィールド", () => {
  it("戻り値に files フィールドが含まれる", async () => {
    // Arrange
    const { client, mock } = await createClient();
    const files = [{ ...FILE_FIXTURE, id: "F999", name: "img.png", mimetype: "image/png" }];
    mock.conversations.history.mockResolvedValue({
      ok: true,
      messages: [{ ts: "111.222", user: "U1", text: "pic", files }],
    } as any);

    // Act
    const result = await client.getChannelHistory("C123");

    // Assert
    expect(result[0].files).toEqual(files);
  });
});

describe("getThreadReplies — files フィールド", () => {
  it("戻り値に files フィールドが含まれる", async () => {
    // Arrange
    const { client, mock } = await createClient();
    const files = [{ ...FILE_FIXTURE, id: "F888", name: "report.pdf" }];
    mock.conversations.replies.mockResolvedValue({
      ok: true,
      messages: [{ ts: "333.444", user: "U2", text: "reply", files }],
    } as any);

    // Act
    const result = await client.getThreadReplies("C123", "333.444");

    // Assert
    expect(result[0].files).toEqual(files);
  });
});
