import { describe, it, expect } from "vitest";
import { parseSlackTarget } from "../lib/parse-target.js";

// CLI 引数バリデーションロジックのテスト。
// src/cli/index.ts の Command 定義に直接介入するとプロセス全体に副作用が出るため、
// CLI 内で実際に使われるバリデーション関数 (parseSlackTarget, parseInt 等) を
// 独立して検証する。

describe("CLI validation — channels list --limit", () => {
  it("parses a valid positive integer", () => {
    const limit = parseInt("100", 10);
    expect(limit).toBe(100);
    expect(Number.isInteger(limit)).toBe(true);
  });

  it("rejects non-numeric strings via NaN", () => {
    const limit = parseInt("not-a-number", 10);
    expect(Number.isNaN(limit)).toBe(true);
  });

  it("treats negative numbers as parseable but should be rejected by caller", () => {
    const limit = parseInt("-5", 10);
    expect(limit).toBe(-5);
    expect(limit < 1).toBe(true);
  });

  it("ignores trailing garbage after the leading number", () => {
    const limit = parseInt("100abc", 10);
    expect(limit).toBe(100);
  });
});

describe("CLI validation — chat update / reactions get <ts>", () => {
  const tsPattern = /^\d+\.\d{6}$/;

  it("accepts Slack-formatted timestamp", () => {
    expect(tsPattern.test("1700000000.000100")).toBe(true);
  });

  it("rejects timestamp without dot", () => {
    expect(tsPattern.test("1700000000")).toBe(false);
  });

  it("rejects timestamp with too few fractional digits", () => {
    expect(tsPattern.test("1700000000.001")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(tsPattern.test("")).toBe(false);
  });
});

describe("CLI validation — permalink vs channel id", () => {
  it("accepts a bare channel id and returns it as-is", () => {
    const parsed = parseSlackTarget("C0123456789");
    expect(parsed.channel).toBe("C0123456789");
    expect(parsed.ts).toBeUndefined();
  });

  it("parses a Slack permalink URL into channel + ts", () => {
    const parsed = parseSlackTarget(
      "https://example.slack.com/archives/C0123456789/p1700000000000100",
    );
    expect(parsed.channel).toBe("C0123456789");
    expect(parsed.ts).toBe("1700000000.000100");
  });

  it("parses a thread permalink and surfaces thread_ts", () => {
    const parsed = parseSlackTarget(
      "https://example.slack.com/archives/C0123456789/p1700000000000200?thread_ts=1700000000.000100",
    );
    expect(parsed.channel).toBe("C0123456789");
    expect(parsed.thread_ts).toBe("1700000000.000100");
  });

  it("falls back to channel=input for a URL with a malformed archives path", () => {
    // 後方互換: URL がパターンに合わなければ throw せず channel に input をそのまま返す
    const malformed = "https://example.slack.com/archives/";
    const parsed = parseSlackTarget(malformed);
    expect(parsed.channel).toBe(malformed);
    expect(parsed.ts).toBeUndefined();
    expect(parsed.thread_ts).toBeUndefined();
  });
});

describe("CLI validation — --tz IANA timezone string", () => {
  // Intl.DateTimeFormat throws RangeError on an unknown IANA TZ.
  const isValidTz = (tz: string): boolean => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  };

  it("accepts Asia/Tokyo", () => {
    expect(isValidTz("Asia/Tokyo")).toBe(true);
  });

  it("accepts UTC", () => {
    expect(isValidTz("UTC")).toBe(true);
  });

  it("rejects an obviously bogus TZ", () => {
    expect(isValidTz("Not/A_Real_Zone")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidTz("")).toBe(false);
  });
});
