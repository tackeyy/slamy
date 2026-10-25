import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
