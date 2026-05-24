/**
 * Slack の permalink URL またはチャンネル ID をパースして
 * { channel, ts?, thread_ts? } を返す。
 *
 * 受け付ける入力:
 *   - permalink URL (スレッド親):
 *       https://<workspace>.slack.com/archives/<channel_id>/p<ts_no_dot>
 *   - permalink URL (スレッド返信):
 *       https://<workspace>.slack.com/archives/<channel_id>/p<msg_ts>?thread_ts=<thread_ts>&cid=<channel_id>
 *   - チャンネル ID (C/D/G で始まる文字列): そのまま channel に返す
 *   - その他: channel に input をそのまま返す (後方互換)
 *
 * ts 復元ルール: URL 中の "p1779626841429219" → "1779626841.429219" (末尾 6 桁を小数部に)
 */
export interface ParsedSlackTarget {
  channel: string;
  ts?: string;
  thread_ts?: string;
}

const PERMALINK_RE =
  /^https?:\/\/[^/]+\/archives\/([A-Z0-9]+)\/p(\d+)(?:\?(.*))?$/;

export function parseSlackTarget(input: string): ParsedSlackTarget {
  if (!input.startsWith("http")) {
    return { channel: input };
  }

  const m = PERMALINK_RE.exec(input);
  if (!m) {
    return { channel: input };
  }

  const channel = m[1];
  const tsNoDot = m[2];
  const ts = tsNoDotToTs(tsNoDot);
  const query = m[3];

  let thread_ts: string | undefined;
  if (query) {
    const params = new URLSearchParams(query);
    const t = params.get("thread_ts");
    if (t) thread_ts = t;
  }

  return { channel, ts, ...(thread_ts ? { thread_ts } : {}) };
}

function tsNoDotToTs(tsNoDot: string): string {
  // 末尾 6 桁を小数部に
  if (tsNoDot.length <= 6) return `0.${tsNoDot.padStart(6, "0")}`;
  const sec = tsNoDot.slice(0, tsNoDot.length - 6);
  const micro = tsNoDot.slice(tsNoDot.length - 6);
  return `${sec}.${micro}`;
}
