import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { SlamyClient } from "../client.js";
import { createMockWebClient } from "../../__tests__/helpers/mock-slack.js";

// 複数のファイルを 1 件の投稿にまとめて送る uploadFiles の試験。
// @slack/web-api の uploadV2 は file_uploads を受け取ると、全ファイルを
// 1 回の files.completeUploadExternal で共有する（同じ channel / thread / comment のとき）。

vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(),
  LogLevel: { DEBUG: "debug", INFO: "info", WARN: "warn", ERROR: "error" },
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn((p: string) => Buffer.from(`content of ${p}`)),
}));

async function createTokenSeparatedMocks(opts: { withUser?: boolean } = { withUser: true }) {
  const botMock = createMockWebClient();
  const userMock = createMockWebClient();
  const { WebClient } = await import("@slack/web-api");
  (WebClient as any).mockImplementation(function (token: string) {
    if (token === "xoxb-bot") return botMock;
    if (token === "xoxp-user") return userMock;
    return createMockWebClient();
  });
  const client = new SlamyClient(
    opts.withUser ? { botToken: "xoxb-bot", userToken: "xoxp-user" } : { botToken: "xoxb-bot" },
  );
  return { client, botMock, userMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  (readFileSync as any).mockImplementation((p: string) => Buffer.from(`content of ${p}`));
});

describe("uploadFiles — 複数のファイルを 1 件の投稿にまとめる", () => {
  it("2 つのファイルを、uploadV2 の 1 回の呼び出しの file_uploads にまとめて渡す", async () => {
    const { client, botMock } = await createTokenSeparatedMocks();

    await client.uploadFiles("C123", ["/a/memo.txt", "/b/report.pdf"], {
      initialComment: "summarize",
    });

    expect(botMock.files.uploadV2).toHaveBeenCalledTimes(1);
    expect(botMock.files.uploadV2).toHaveBeenCalledWith({
      channel_id: "C123",
      initial_comment: "summarize",
      file_uploads: [
        { file: Buffer.from("content of /a/memo.txt"), filename: "memo.txt", title: "memo.txt" },
        { file: Buffer.from("content of /b/report.pdf"), filename: "report.pdf", title: "report.pdf" },
      ],
    });
  });

  it("渡した順番を保つ", async () => {
    const { client, botMock } = await createTokenSeparatedMocks();

    await client.uploadFiles("C123", ["/z.txt", "/a.txt", "/m.txt"]);

    const args = (botMock.files.uploadV2 as any).mock.calls[0][0];
    expect(args.file_uploads.map((u: any) => u.filename)).toEqual(["z.txt", "a.txt", "m.txt"]);
  });

  it("thread_ts を指定すると、まとめた投稿をそのスレッドへ返信として付ける", async () => {
    const { client, botMock } = await createTokenSeparatedMocks();

    await client.uploadFiles("C123", ["/a.txt", "/b.txt"], { threadTs: "1700000000.000100" });

    expect(botMock.files.uploadV2).toHaveBeenCalledWith(
      expect.objectContaining({ channel_id: "C123", thread_ts: "1700000000.000100" }),
    );
  });

  it("initial_comment と thread_ts を指定しなければ、そのキーを渡さない", async () => {
    const { client, botMock } = await createTokenSeparatedMocks();

    await client.uploadFiles("C123", ["/a.txt", "/b.txt"]);

    const args = (botMock.files.uploadV2 as any).mock.calls[0][0];
    expect(Object.keys(args).sort()).toEqual(["channel_id", "file_uploads"]);
  });

  it("asUser では userClient で送り、botClient は使わない", async () => {
    const { client, botMock, userMock } = await createTokenSeparatedMocks();

    await client.uploadFiles("C123", ["/a.txt", "/b.txt"], { asUser: true });

    expect(userMock.files.uploadV2).toHaveBeenCalledTimes(1);
    expect(botMock.files.uploadV2).not.toHaveBeenCalled();
  });

  it("asUser で user token が無ければ、ファイルを読まずにエラーにする", async () => {
    const { client, botMock, userMock } = await createTokenSeparatedMocks({ withUser: false });

    await expect(client.uploadFiles("C123", ["/a.txt", "/b.txt"], { asUser: true })).rejects.toThrow(
      "--as-user requires a user token",
    );
    expect(botMock.files.uploadV2).not.toHaveBeenCalled();
    expect(userMock.files.uploadV2).not.toHaveBeenCalled();
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("宛先が User ID なら conversations.open で DM を開き、その ID に送る", async () => {
    const { client, botMock } = await createTokenSeparatedMocks();
    (botMock.conversations as any).open = vi.fn().mockResolvedValue({ ok: true, channel: { id: "D123" } });

    await client.uploadFiles("U12345", ["/a.txt", "/b.txt"]);

    expect(botMock.conversations.open).toHaveBeenCalledWith({ users: "U12345" });
    expect(botMock.files.uploadV2).toHaveBeenCalledWith(expect.objectContaining({ channel_id: "D123" }));
  });

  it("ファイルが 0 件ならエラーにし、uploadV2 を呼ばない", async () => {
    const { client, botMock } = await createTokenSeparatedMocks();

    await expect(client.uploadFiles("C123", [])).rejects.toThrow(/at least one file/);
    expect(botMock.files.uploadV2).not.toHaveBeenCalled();
  });

  it("1 つでも読めないファイルがあれば、何も送らずにエラーを返す", async () => {
    const { client, botMock } = await createTokenSeparatedMocks();
    (readFileSync as any).mockImplementation((p: string) => {
      if (p === "/missing.txt") throw new Error("ENOENT: no such file");
      return Buffer.from(`content of ${p}`);
    });

    await expect(client.uploadFiles("C123", ["/a.txt", "/missing.txt"])).rejects.toThrow(/ENOENT/);
    expect(botMock.files.uploadV2).not.toHaveBeenCalled();
  });
});


describe("uploadFiles — 境界条件", () => {
  it("asUserのDMはuserClientで開く", async () => {
    const { client, botMock, userMock } = await createTokenSeparatedMocks();
    userMock.conversations.open.mockResolvedValue({ ok: true, channel: { id: "D123" } });
    await client.uploadFiles("U12345", ["/a.txt", "/b.txt"], { asUser: true });
    expect(userMock.conversations.open).toHaveBeenCalledExactlyOnceWith({ users: "U12345" });
    expect(userMock.files.uploadV2).toHaveBeenCalledWith(expect.objectContaining({ channel_id: "D123" }));
    expect(botMock.conversations.open).not.toHaveBeenCalled();
    expect(botMock.files.uploadV2).not.toHaveBeenCalled();
  });

  it("空文字で明示したオプションも指定値のまま渡す", async () => {
    const { client, botMock } = await createTokenSeparatedMocks();
    await client.uploadFiles("C123", ["/a.txt"], { initialComment: "", threadTs: "" });
    expect(botMock.files.uploadV2).toHaveBeenCalledWith(expect.objectContaining({ initial_comment: "", thread_ts: "" }));
  });

  it("読み込みに失敗したらDMも開かず元の例外を返す", async () => {
    const { client, botMock } = await createTokenSeparatedMocks();
    const error = new Error("ENOENT");
    vi.mocked(readFileSync).mockImplementation(() => { throw error; });
    await expect(client.uploadFiles("U12345", ["/missing.txt"])).rejects.toBe(error);
    expect(botMock.conversations.open).not.toHaveBeenCalled();
    expect(botMock.files.uploadV2).not.toHaveBeenCalled();
  });
});
