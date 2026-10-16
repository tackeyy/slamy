import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBlocksFile } from "../blocks-file.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function file(content: string): string {
  const d = mkdtempSync(join(tmpdir(), "slamy-blocks-"));
  dirs.push(d);
  const p = join(d, "SECRETPATHMARK.json");
  writeFileSync(p, content);
  return p;
}

describe("readBlocksFile", () => {
  it("JSON の配列を読む", () => {
    expect(readBlocksFile(() => readFileSync(file('[{"type":"section"}]'), "utf8"))).toEqual([{ type: "section" }]);
  });

  it.each([
    ["JSON でない中身", "SECRETCONTENTMARK"],
    ["壊れた JSON", '[{"type": SECRETCONTENTMARK'],
  ])("%s は、パスも中身も含まない固定の文面で失敗する", (_n, content) => {
    const p = file(content);
    let message = "";
    try {
      readBlocksFile(() => readFileSync(p, "utf8"));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe("Could not read --blocks-file as a JSON blocks array");
  });

  it("読めないパスは、パスを含まない固定の文面で失敗する", () => {
    expect(() => readBlocksFile(() => readFileSync("/nonexistent/SECRETPATHMARK.json", "utf8"))).toThrow(
      /^Could not read --blocks-file as a JSON blocks array$/,
    );
  });
});
