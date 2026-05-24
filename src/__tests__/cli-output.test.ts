import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  jsonOutput,
  tsvRow,
  humanChannelLine,
} from "../lib/cli-format.js";

// 実 CLI コードと結びついたテスト。
// src/cli/index.ts は src/lib/cli-format.ts のこれら関数を直接 import して使うため、
// ここでテストが失敗 = 実 CLI 出力が壊れている、という関係が成り立つ。

describe("jsonOutput", () => {
  it("emits 2-space indented JSON", () => {
    const out = jsonOutput({ ok: true, ts: "1700000000.000100" });
    expect(out).toBe('{\n  "ok": true,\n  "ts": "1700000000.000100"\n}');
  });

  it("serializes arrays without trailing comma", () => {
    const out = jsonOutput([{ id: "C1" }, { id: "C2" }]);
    expect(out).toContain('"id": "C1"');
    expect(out).toContain('"id": "C2"');
    expect(out.endsWith("]")).toBe(true);
  });

  it("round-trips through JSON.parse", () => {
    const original = { channels: [{ id: "C1", name: "general" }] };
    const out = jsonOutput(original);
    expect(JSON.parse(out)).toEqual(original);
  });

  it("escapes embedded double quotes", () => {
    const out = jsonOutput({ text: 'he said "hi"' });
    expect(out).toContain('\\"hi\\"');
  });
});

describe("tsvRow", () => {
  it("joins cells with a single tab", () => {
    const row = tsvRow(["C0123", "general", 42, "private"]);
    expect(row).toBe("C0123\tgeneral\t42\tprivate");
    expect(row.split("\t")).toHaveLength(4);
  });

  it("preserves empty cells as empty strings, keeping column count", () => {
    const row = tsvRow(["C0123", "general", "", ""]);
    expect(row.split("\t")).toHaveLength(4);
  });

  it("does not emit a trailing newline (caller adds it)", () => {
    const row = tsvRow(["a", "b"]);
    expect(row.endsWith("\n")).toBe(false);
  });

  it("stringifies numeric cells", () => {
    const row = tsvRow([42, "x"]);
    expect(row).toBe("42\tx");
  });
});

describe("humanChannelLine", () => {
  it("pads channel name to 30 chars and appends id + unread count", () => {
    const line = humanChannelLine("general", "C0123456789", false, 5);
    expect(line.startsWith("#general")).toBe(true);
    expect(line).toContain("C0123456789");
    expect(line).toContain("[5 unread]");
  });

  it("marks private channels with (private)", () => {
    const line = humanChannelLine("secret", "C9999999999", true, 0);
    expect(line).toContain("(private)");
    expect(line).toContain("[0 unread]");
  });

  it("does not mark public channels", () => {
    const line = humanChannelLine("general", "C0123456789", false, 0);
    expect(line).not.toContain("(private)");
  });

  it("supports the 'members' label variant", () => {
    const line = humanChannelLine("general", "C0123456789", false, 42, "members");
    expect(line).toContain("[42 members]");
    expect(line).not.toContain("unread");
  });
});

describe("stdout/stderr spy plumbing", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("captures jsonOutput piped through console.log", () => {
    console.log(jsonOutput({ ok: true }));
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[0]).toContain('"ok": true');
  });

  it("keeps console.error separate from console.log", () => {
    console.error("boom");
    expect(errSpy).toHaveBeenCalledWith("boom");
    expect(logSpy).not.toHaveBeenCalled();
  });
});
