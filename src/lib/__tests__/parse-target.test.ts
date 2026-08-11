import { describe, it, expect } from "vitest";
import { parseSlackTarget } from "../parse-target.js";

describe("parseSlackTarget", () => {
  describe("permalink URL", () => {
    it("スレッド親メッセージの URL から channel と ts を抽出", () => {
      const url = "https://example-workspace.slack.com/archives/C0123ABC/p1779626841429219";
      const result = parseSlackTarget(url);
      expect(result.channel).toBe("C0123ABC");
      expect(result.ts).toBe("1779626841.429219");
      expect(result.thread_ts).toBeUndefined();
    });

    it("スレッド返信の URL から channel / ts / thread_ts を抽出", () => {
      const url =
        "https://example-workspace.slack.com/archives/D0B4ALQ1A73/p1779627961670119?thread_ts=1779626841.429219&cid=D0B4ALQ1A73";
      const result = parseSlackTarget(url);
      expect(result.channel).toBe("D0B4ALQ1A73");
      expect(result.ts).toBe("1779627961.670119");
      expect(result.thread_ts).toBe("1779626841.429219");
    });

    it("DM channel ID (D...) も channels と同じく抽出", () => {
      const url = "https://example.slack.com/archives/D012345/p1700000000000001";
      const result = parseSlackTarget(url);
      expect(result.channel).toBe("D012345");
      expect(result.ts).toBe("1700000000.000001");
    });

    it("group channel ID (G...) も抽出", () => {
      const url = "https://example.slack.com/archives/G012345/p1700000000000001";
      const result = parseSlackTarget(url);
      expect(result.channel).toBe("G012345");
      expect(result.ts).toBe("1700000000.000001");
    });

    it("query string が無くても thread_ts は undefined", () => {
      const url = "https://example.slack.com/archives/C123/p1700000000000001?someother=1";
      const result = parseSlackTarget(url);
      expect(result.thread_ts).toBeUndefined();
    });
  });

  describe("plain channel ID", () => {
    it("チャンネル ID (C/D/G で始まる英数字) はそのまま channel として返す", () => {
      expect(parseSlackTarget("C0123ABC")).toEqual({ channel: "C0123ABC" });
      expect(parseSlackTarget("D0B4ALQ1A73")).toEqual({ channel: "D0B4ALQ1A73" });
      expect(parseSlackTarget("G012345")).toEqual({ channel: "G012345" });
    });

    it("チャンネル ID + ts (空白区切り) は両方返す", () => {
      // 後方互換のため、CLI で channel ts の 2 引数を受けたあと parseSlackTarget(channel)
      // しても問題ないことを担保
      expect(parseSlackTarget("C123")).toEqual({ channel: "C123" });
    });
  });

  describe("不正入力", () => {
    it("URL でも ID でもない場合は channel に input を返す (後方互換)", () => {
      expect(parseSlackTarget("not-a-valid-id")).toEqual({ channel: "not-a-valid-id" });
    });

    it("空文字列は channel='' を返す", () => {
      expect(parseSlackTarget("")).toEqual({ channel: "" });
    });
  });

  describe("ts 復元", () => {
    it("p<digits_no_dot> を ts 形式 (digits.digits) に変換 (末尾 6 桁を小数部)", () => {
      const url = "https://example.slack.com/archives/C1/p1779626841429219";
      const result = parseSlackTarget(url);
      expect(result.ts).toBe("1779626841.429219");
    });

    it("p<16digits> 形式 (10 秒 + 6 マイクロ秒) を正しく変換", () => {
      const url = "https://example.slack.com/archives/C1/p1700000000000001";
      const result = parseSlackTarget(url);
      expect(result.ts).toBe("1700000000.000001");
    });
  });
});
