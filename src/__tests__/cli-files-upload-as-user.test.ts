import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// src/cli/index.ts は import 時に program.parseAsync() まで実行されるため、
// 既存の cli-workspace-wiring.test.ts と同じくソース文字列で CLI 配線を検証する。
const cliSource = readFileSync(new URL("../cli/index.ts", import.meta.url), "utf8");

/** files upload コマンド定義のブロックを切り出す。 */
function filesUploadBlock(): string {
  const start = cliSource.indexOf('.command("upload <channel_id> <file_path>")');
  const end = cliSource.indexOf('.command("download <file_id_or_url>")');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return cliSource.slice(start, end);
}

describe("CLI files upload --as-user wiring", () => {
  it("files upload は --as-user オプションを定義する", () => {
    const block = filesUploadBlock();
    expect(block).toContain('"--as-user"');
    expect(block).toContain(
      "Upload as the authenticated user (uses user token instead of bot token)",
    );
  });

  it("--as-user は uploadFile へ asUser: opts.asUser === true として渡る", () => {
    const block = filesUploadBlock();
    expect(block).toMatch(
      /client\.uploadFile\(\s*channelId,\s*filePath,\s*\{[\s\S]*?asUser:\s*opts\.asUser === true,/,
    );
  });

  it("messages post と同じ形式で asUser を渡している", () => {
    expect(cliSource).toContain("asUser: opts.asUser === true,");
    // messages post と files upload の両方で同じ渡し方が使われている
    expect(cliSource.match(/asUser: opts\.asUser === true,/g)).toHaveLength(2);
  });
});
