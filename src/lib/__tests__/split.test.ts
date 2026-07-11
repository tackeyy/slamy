import { describe, it, expect } from "vitest";
import {
  splitMessage,
  MAX_MESSAGE_LENGTH,
  CHAT_UPDATE_MAX_LENGTH,
  CHAT_POSTMESSAGE_MAX_LENGTH,
} from "../split.js";

/** Count Unicode code points (same as Go's utf8.RuneCountInString). */
function runeCount(s: string): number {
  return [...s].length;
}

describe("splitMessage", () => {
  // --- Go 版テスト完全移植 ---

  it("ShortMessage", () => {
    const text = "Hello, world!";
    const chunks = splitMessage(text);
    expect(chunks).toEqual([text]);
  });

  it("EmptyText", () => {
    const chunks = splitMessage("");
    expect(chunks).toEqual([""]);
  });

  it("ExactlyMaxLen", () => {
    const text = "a".repeat(MAX_MESSAGE_LENGTH);
    const chunks = splitMessage(text);
    expect(chunks).toEqual([text]);
  });

  it("ParagraphBoundary", () => {
    const para1 = "a".repeat(2500);
    const para2 = "b".repeat(2500);
    const text = `${para1}\n\n${para2}`;
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(para1);
    expect(chunks[1]).toBe(para2);
  });

  it("LineBoundary", () => {
    const line1 = "x".repeat(2500);
    const line2 = "y".repeat(2500);
    const text = `${line1}\n${line2}`;
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(line1);
    expect(chunks[1]).toBe(line2);
  });

  it("ForceSplitLongLine", () => {
    const tail = 2000;
    const text = "z".repeat(MAX_MESSAGE_LENGTH * 2 + tail);
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(3);
    expect(runeCount(chunks[0])).toBe(MAX_MESSAGE_LENGTH);
    expect(runeCount(chunks[1])).toBe(MAX_MESSAGE_LENGTH);
    expect(runeCount(chunks[2])).toBe(tail);
  });

  it("MultipleParagraphsFitInOneChunk", () => {
    const text = "para1\n\npara2\n\npara3";
    const chunks = splitMessage(text);
    expect(chunks).toEqual([text]);
  });

  it("ThreeParagraphsSplit", () => {
    const para1 = "a".repeat(2000);
    const para2 = "b".repeat(2000);
    const para3 = "c".repeat(2000);
    const text = `${para1}\n\n${para2}\n\n${para3}`;
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(3);
  });

  it("MixedParagraphsAndLines", () => {
    const small = "header info";
    const bigLine1 = "m".repeat(3000);
    const bigLine2 = "n".repeat(3000);
    const bigPara = `${bigLine1}\n${bigLine2}`;
    const text = `${small}\n\n${bigPara}`;
    const chunks = splitMessage(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toBe(small);
  });

  it("PreservesContent", () => {
    const para1 = "a".repeat(3000);
    const para2 = "b".repeat(3000);
    const text = `${para1}\n\n${para2}`;
    const chunks = splitMessage(text);
    const total = chunks.reduce((sum, c) => sum + runeCount(c), 0);
    expect(total).toBe(runeCount(para1) + runeCount(para2));
  });

  it("NoChunkExceedsMaxLen", () => {
    const texts = [
      "a".repeat(12000),
      "x".repeat(3000) + "\n\n" + "y".repeat(5000) + "\n\n" + "z".repeat(3000),
      "line\n".repeat(2000),
    ];
    for (const text of texts) {
      const chunks = splitMessage(text);
      for (const chunk of chunks) {
        expect(runeCount(chunk)).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
      }
    }
  });

  // --- Japanese / multi-byte character tests ---

  it("JapaneseText", () => {
    const jp = "あ".repeat(MAX_MESSAGE_LENGTH);
    const chunks = splitMessage(jp);
    expect(chunks).toHaveLength(1);
  });

  it("JapaneseSplit", () => {
    const para1 = "あ".repeat(2500);
    const para2 = "い".repeat(2500);
    const text = `${para1}\n\n${para2}`;
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(para1);
    expect(chunks[1]).toBe(para2);
  });

  it("JapaneseForceSplit", () => {
    const total = MAX_MESSAGE_LENGTH + 1000;
    const text = "漢".repeat(total);
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(runeCount(chunks[0])).toBe(MAX_MESSAGE_LENGTH);
    expect(runeCount(chunks[1])).toBe(total - MAX_MESSAGE_LENGTH);
  });

  it("EmojiSplit", () => {
    const total = MAX_MESSAGE_LENGTH + 1000;
    const text = "🔴".repeat(total);
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(runeCount(chunks[0])).toBe(MAX_MESSAGE_LENGTH);
    // Verify no surrogate pair corruption
    for (const chunk of chunks) {
      // Each chunk should only contain valid emoji sequences
      expect([...chunk].every((c) => c === "🔴")).toBe(true);
    }
  });

  it("RealisticCRMReport", () => {
    const header =
      "📋 *チェック結果*\n実行日: 2026-01-01\n対象: サンプルデータ\n不備件数: 50件 / 100件中";
    const sections: string[] = [];
    for (let i = 0; i < 30; i++) {
      let section = `🔴 *<@UXXXXXXXXX${String.fromCharCode(65 + (i % 26))}>*\n`;
      for (let j = 0; j < 8; j++) {
        section += `• テスト項目${String.fromCharCode(65 + j)} - 未対応\n`;
      }
      sections.push(section);
    }
    const text = header + "\n\n" + sections.join("\n\n");
    const chunks = splitMessage(text);

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(runeCount(chunk)).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
      expect(runeCount(chunk)).toBeGreaterThan(0);
    }
  });

  // --- Edge cases ---

  it("ConsecutiveEmptyParagraphs", () => {
    const text = "start\n\n\n\nend";
    const chunks = splitMessage(text);
    expect(chunks).toEqual([text]);
  });

  it("TrailingNewlines", () => {
    const text = "a".repeat(MAX_MESSAGE_LENGTH - 1) + "\n\n";
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(1);
  });

  it("OnlyNewlines", () => {
    const text = "\n".repeat(100);
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(1);
  });

  it("MaxLenPlusOne", () => {
    const text = "a".repeat(MAX_MESSAGE_LENGTH) + "\n\nb";
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe("a".repeat(MAX_MESSAGE_LENGTH));
    expect(chunks[1]).toBe("b");
  });

  // --- TypeScript 追加テスト: サロゲートペア ---

  it("SurrogatePairAtBoundary", () => {
    // (MAX_MESSAGE_LENGTH - 1) ASCII chars + 1 emoji = MAX_MESSAGE_LENGTH code points → should not split
    const text = "a".repeat(MAX_MESSAGE_LENGTH - 1) + "🔴";
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(1);
  });

  it("SurrogatePairOverBoundary", () => {
    // MAX_MESSAGE_LENGTH ASCII chars + 1 emoji = MAX_MESSAGE_LENGTH + 1 code points → should split
    const text = "a".repeat(MAX_MESSAGE_LENGTH) + "🔴";
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe("a".repeat(MAX_MESSAGE_LENGTH));
    expect(chunks[1]).toBe("🔴");
  });
});

describe("Slack length 上限定数 (navibot Issue #381 / #382)", () => {
  it("CHAT_POSTMESSAGE_MAX_LENGTH は公式仕様 (40,000 chars)", () => {
    expect(CHAT_POSTMESSAGE_MAX_LENGTH).toBe(40000);
  });

  it("CHAT_UPDATE_MAX_LENGTH は 3,500 chars (margin 500 拡大)", () => {
    // 旧 3,900 (margin 100) では entity 展開後 length 超過で msg_too_long が頻発したため
    // navibot Issue #381 / #382 で margin を 500 chars に拡大した。
    expect(CHAT_UPDATE_MAX_LENGTH).toBe(3500);
  });

  it("MAX_MESSAGE_LENGTH は CHAT_UPDATE_MAX_LENGTH のエイリアス", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(CHAT_UPDATE_MAX_LENGTH);
  });

  it("URL / mention entity を多数含む chunk も新上限以下に収まる", () => {
    // 各 entity が展開後 length で膨らむケースのシミュレーション。
    // 実際の Slack はサーバ側で `<@U...>` → `@username`、`<https://long-url|title>` →
    // `title` 等の置換を行い length を再計算する。defensive margin 500 で msg_too_long リスクを抑える。
    const mention = "<@U0123456789>"; // 14 chars in payload, "@longname" expansion 可能性あり
    const link = "<https://docs.example.invalid/needs/12345?tab=interviews|議事録>"; // ~70 chars in payload
    const line = `${mention} ${link} ${"あ".repeat(50)}\n`;
    const repeat = Math.ceil((CHAT_UPDATE_MAX_LENGTH * 3) / line.length);
    const text = line.repeat(repeat);
    const chunks = splitMessage(text, CHAT_UPDATE_MAX_LENGTH);
    for (const chunk of chunks) {
      expect(runeCount(chunk)).toBeLessThanOrEqual(CHAT_UPDATE_MAX_LENGTH);
    }
  });
});
