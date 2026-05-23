import { describe, it, expect } from "vitest";
import { tzDateToEpochSec } from "../lib/tz.js";

describe("tzDateToEpochSec", () => {
  it("Asia/Tokyo の 00:00:00 が JST 0:00 = UTC 前日 15:00 を返す", () => {
    const result = tzDateToEpochSec("2026-05-22", "00:00:00", "Asia/Tokyo");
    // JST 2026-05-22 00:00:00 = UTC 2026-05-21 15:00:00
    const expected = Date.UTC(2026, 4, 21, 15, 0, 0) / 1000;
    expect(result).toBe(expected);
  });

  it("Asia/Tokyo の 23:59:59 が JST 23:59:59 = UTC 同日 14:59:59 を返す", () => {
    const result = tzDateToEpochSec("2026-05-22", "23:59:59", "Asia/Tokyo");
    const expected = Date.UTC(2026, 4, 22, 14, 59, 59) / 1000;
    expect(result).toBe(expected);
  });

  it("UTC の 00:00:00 が UTC 0:00 を返す", () => {
    const result = tzDateToEpochSec("2026-05-22", "00:00:00", "UTC");
    const expected = Date.UTC(2026, 4, 22, 0, 0, 0) / 1000;
    expect(result).toBe(expected);
  });

  it("DST のある TZ (America/New_York) でも正しく算出する", () => {
    // 2026-07-04 は EDT (UTC-4)
    const summer = tzDateToEpochSec("2026-07-04", "00:00:00", "America/New_York");
    expect(summer).toBe(Date.UTC(2026, 6, 4, 4, 0, 0) / 1000);

    // 2026-01-04 は EST (UTC-5)
    const winter = tzDateToEpochSec("2026-01-04", "00:00:00", "America/New_York");
    expect(winter).toBe(Date.UTC(2026, 0, 4, 5, 0, 0) / 1000);
  });

  it("不正な日付文字列はエラー", () => {
    expect(() => tzDateToEpochSec("not-a-date", "00:00:00", "UTC")).toThrow();
  });
});
