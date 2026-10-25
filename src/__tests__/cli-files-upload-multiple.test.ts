import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { stripTypeScriptTypes } from "node:module";

// src/cli/index.ts は import 時に program.parseAsync() まで実行されるため、
// cli-files-upload-as-user.test.ts と同じくソース文字列で CLI 配線を検証する。
const cliSource = readFileSync(new URL("../cli/index.ts", import.meta.url), "utf8");

function filesUploadBlock(): string {
  const start = cliSource.search(/\.command\("upload <channel_id> <file_paths\.\.\.>"\)/);
  const end = cliSource.indexOf('.command("download <file_id_or_url>")');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return cliSource.slice(start, end);
}

describe("CLI files upload — 複数のファイル", () => {
  it("file_paths を可変長の引数として受け取る", () => {
    expect(cliSource).toContain('.command("upload <channel_id> <file_paths...>")');
    expect(cliSource).not.toContain('.command("upload <channel_id> <file_path>")');
  });

  it("2 つ以上のときは uploadFiles に全部を渡す", () => {
    const block = filesUploadBlock();
    expect(block).toMatch(/client\.uploadFiles\(\s*channelId,\s*filePaths,/);
  });

  it("1 つのときは従来どおり uploadFile に渡す（--title・--filename を保つ）", () => {
    const block = filesUploadBlock();
    expect(block).toMatch(/client\.uploadFile\(\s*channelId,\s*filePaths\[0\],/);
  });

  it("複数のときに --title・--filename を指定したらエラーにする", () => {
    const block = filesUploadBlock();
    expect(block).toMatch(/--title and --filename can be used only with a single file/);
  });

  it("asUser は両方の経路で opts.asUser === true として渡る", () => {
    const block = filesUploadBlock();
    expect(block.match(/asUser: opts\.asUser === true,/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

// Execute the actual command definition with isolated clients and output sinks.
function uploadCommand(mode: "json" | "plain" | "human") {
  const files = new Command();
  const client = { uploadFile: vi.fn(), uploadFiles: vi.fn() };
  const createClient = vi.fn().mockResolvedValue(client);
  const output = { log: vi.fn(), error: vi.fn() };
  const jsonOutput = vi.fn();
  const exit = vi.fn();
  new Function("files", "createClient", "getOutputMode", "jsonOutput", "console", "process",
    stripTypeScriptTypes(`files${filesUploadBlock()}`),
  )(files, createClient, () => mode, jsonOutput, output, { exit });
  return { files, client, createClient, output, jsonOutput, exit };
}

describe("CLI files upload — 実行結果", () => {
  it.each(["json", "plain", "human"] as const)("複数ファイルの%s出力とオプションを保つ", async (mode) => {
    const { files, client, output, jsonOutput } = uploadCommand(mode);
    await files.parseAsync(["upload", "C123", "memo.txt", "report.pdf", "--as-user",
      "--thread-ts", "1700000000.000100", "--initial-comment", "hello"], { from: "user" });
    expect(client.uploadFile).not.toHaveBeenCalled();
    expect(client.uploadFiles).toHaveBeenCalledExactlyOnceWith("C123", ["memo.txt", "report.pdf"], {
      asUser: true, threadTs: "1700000000.000100", initialComment: "hello",
    });
    if (mode === "json") {
      expect(jsonOutput).toHaveBeenCalledExactlyOnceWith({ channel: "C123", files: ["memo.txt", "report.pdf"], uploaded: true });
      expect(output.log).not.toHaveBeenCalled();
    } else if (mode === "plain") {
      expect(output.log.mock.calls).toEqual([["C123\tmemo.txt\tuploaded"], ["C123\treport.pdf\tuploaded"]]);
    } else {
      expect(output.log).toHaveBeenCalledExactlyOnceWith("Files uploaded to C123: memo.txt, report.pdf");
    }
  });

  it.each(["json", "plain", "human"] as const)("単一ファイルの%s出力と上書き指定を保つ", async (mode) => {
    const { files, client, output, jsonOutput } = uploadCommand(mode);
    await files.parseAsync(["upload", "C123", "memo.txt", "--title", "Title", "--filename", "name.txt"], { from: "user" });
    expect(client.uploadFiles).not.toHaveBeenCalled();
    expect(client.uploadFile).toHaveBeenCalledExactlyOnceWith("C123", "memo.txt", {
      asUser: false, threadTs: undefined, title: "Title", filename: "name.txt", initialComment: undefined,
    });
    if (mode === "json") {
      expect(jsonOutput).toHaveBeenCalledExactlyOnceWith({ channel: "C123", file: "memo.txt", uploaded: true });
    } else if (mode === "plain") {
      expect(output.log).toHaveBeenCalledExactlyOnceWith("C123\tmemo.txt\tuploaded");
    } else {
      expect(output.log).toHaveBeenCalledExactlyOnceWith("File uploaded to C123: memo.txt");
    }
  });

  it.each(["--title", "--filename"])("複数ファイルで%sを空文字指定してもクライアント生成前に拒否する", async (option) => {
    const { files, createClient, output, exit } = uploadCommand("json");
    await files.parseAsync(["upload", "C123", "a.txt", "b.txt", option, ""], { from: "user" });
    expect(createClient).not.toHaveBeenCalled();
    expect(output.error).toHaveBeenCalledExactlyOnceWith("Error: --title and --filename can be used only with a single file");
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
