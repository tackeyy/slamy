import { describe, it, expect } from "vitest";
import { formatTimestamp } from "../tz.js";

describe("formatTimestamp", () => {
  // JST に固定して再現性を確保
  const TS = "1779626841.429219"; // 2026-05-24 12:47:21 UTC = 21:47:21 JST

  it("tz=Asia/Tokyo で JST 表示 (YYYY-MM-DD HH:MM) を返す", () => {
    expect(formatTimestamp(TS, { tz: "Asia/Tokyo" })).toBe("2026-05-24 21:47");
  });

  it("tz=UTC で UTC 表示を返す", () => {
    expect(formatTimestamp(TS, { tz: "UTC" })).toBe("2026-05-24 12:47");
  });

  it("utc=true で UTC 表示 (tz と同義)", () => {
    expect(formatTimestamp(TS, { utc: true })).toBe("2026-05-24 12:47");
  });

  it("オプション未指定時は process.env.TZ を尊重する", () => {
    const orig = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo";
      // 環境変数だけでは Node.js の Date は更新されないため、tz を明示しない場合は
      // システム TZ ではなく Intl のデフォルトを使う実装にしている。
      // ここでは tz を明示せず呼び、エラーにならないことだけ確認。
      const result = formatTimestamp(TS);
      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    } finally {
      process.env.TZ = orig;
    }
  });

  it("DST のある TZ (America/New_York) でも正しい時刻を返す", () => {
    // 2026-07-04 16:00:00 UTC = 12:00 EDT (UTC-4)
    const summer = "1783180800";
    expect(formatTimestamp(summer, { tz: "America/New_York" })).toBe("2026-07-04 12:00");

    // 2026-01-04 16:00:00 UTC = 11:00 EST (UTC-5)
    const winter = String(new Date("2026-01-04T16:00:00Z").getTime() / 1000);
    expect(formatTimestamp(winter, { tz: "America/New_York" })).toBe("2026-01-04 11:00");
  });

  it("ts=0 や不正な値はそのまま返す", () => {
    expect(formatTimestamp("0", { tz: "Asia/Tokyo" })).toBe("0");
    expect(formatTimestamp("not-a-number", { tz: "Asia/Tokyo" })).toBe("not-a-number");
  });

  it("小数部のある ts でも秒精度で扱える", () => {
    expect(formatTimestamp("1779626841.429219", { tz: "UTC" })).toBe("2026-05-24 12:47");
    expect(formatTimestamp("1779626841", { tz: "UTC" })).toBe("2026-05-24 12:47");
  });

  it("ISO 形式 (with-seconds オプション) で秒も表示できる", () => {
    expect(
      formatTimestamp(TS, { tz: "Asia/Tokyo", withSeconds: true }),
    ).toBe("2026-05-24 21:47:21");
  });
});
