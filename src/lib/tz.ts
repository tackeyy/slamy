/**
 * 指定タイムゾーンで "YYYY-MM-DD HH:MM:SS" を解釈し、UTC epoch (秒) を返す。
 *
 * Node.js 内蔵の Intl.DateTimeFormat を使うため追加依存なし。
 * DST が絡む TZ でも、対象日時点の offset を正しく算出する。
 */
export function tzDateToEpochSec(
  dateStr: string, // "YYYY-MM-DD"
  timeStr: string, // "HH:MM:SS"
  tz: string, // IANA TZ name (例: "Asia/Tokyo")
): number {
  // 一旦 UTC として解釈した naive epoch
  const naiveUtcMs = Date.parse(`${dateStr}T${timeStr}Z`);
  if (Number.isNaN(naiveUtcMs)) {
    throw new Error(`Invalid date/time: ${dateStr} ${timeStr}`);
  }

  // 同じ瞬間を tz で見たときの wall-clock time を取得 (= naive を tz の時刻として見た値)
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date(naiveUtcMs));
  const get = (type: string): number =>
    parseInt(parts.find((p) => p.type === type)?.value || "0", 10);

  const tzWallMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  // naive を UTC とみなした時刻と、tz の wall-clock の差 = tz の UTC オフセット
  // tz で "dateStr timeStr" を表す瞬間は naive から逆方向に offset 分ずらした時刻
  const offsetMs = tzWallMs - naiveUtcMs;
  return Math.floor((naiveUtcMs - offsetMs) / 1000);
}
