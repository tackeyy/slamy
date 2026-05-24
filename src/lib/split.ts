/**
 * 公式仕様の chat.postMessage / chat.postEphemeral / webhooks 上限 (40,000 chars)。
 *
 * Slack 公式 changelog: https://docs.slack.dev/changelog/2018-truncating-really-long-messages/
 *
 * `replyToThread` / `postMessage` 経由の自動分割はこの上限で行うことで、
 * 長文応答が必要以上に多数の chunks に分割されるのを避ける。
 */
export const CHAT_POSTMESSAGE_MAX_LENGTH = 40000;

/**
 * chat.update の defensive 上限 (3,900 chars)。
 *
 * `chat.update` は公式 docs に上限の明記がなく、実測では 4,000 chars 付近で
 * `msg_too_long` を返す。entity 展開 (`<@U...>` mentions / `<https://...|title>` 等) で
 * サーバ側の length が `[...text].length` の値を超えることがあるため、
 * defensive margin (100 chars) を含めた 3,900 を採用。
 *
 * Empirical evidence: navibot req_20260523165417_5b15b837 (2026-05-24 01:56 JST)
 * — `chat.update` が 4,000-codepoint チェックを通過したペイロードに対して
 * `msg_too_long` を返した。
 */
export const CHAT_UPDATE_MAX_LENGTH = 3900;

/**
 * Backward-compatible alias. 既存のコードベースが `MAX_MESSAGE_LENGTH` を参照しているため、
 * 最も厳しい値 (= CHAT_UPDATE_MAX_LENGTH) を維持する。
 *
 * 新しい呼び出しでは API method に応じて `CHAT_POSTMESSAGE_MAX_LENGTH` /
 * `CHAT_UPDATE_MAX_LENGTH` を明示的に使うことを推奨。
 */
export const MAX_MESSAGE_LENGTH = CHAT_UPDATE_MAX_LENGTH;

/**
 * Split text into chunks of at most maxLen characters (Unicode code points).
 * It splits at paragraph boundaries (\n\n) first, then at line boundaries (\n),
 * and finally by character count if a single line exceeds maxLen.
 *
 * Uses spread syntax [...str] for correct Unicode character counting
 * (handles surrogate pairs / emoji correctly).
 */
export function splitMessage(text: string, maxLen: number = MAX_MESSAGE_LENGTH): string[] {
  if (charCount(text) <= maxLen) {
    return [text];
  }

  const paragraphs = text.split("\n\n");
  const chunks: string[] = [];
  let current = "";
  let currentLen = 0;

  for (const para of paragraphs) {
    const paraLen = charCount(para);
    const sepLen = currentLen > 0 ? 2 : 0; // "\n\n"

    if (currentLen + sepLen + paraLen <= maxLen) {
      if (sepLen > 0) {
        current += "\n\n";
      }
      current += para;
      currentLen += sepLen + paraLen;
      continue;
    }

    // Flush current chunk if non-empty
    if (currentLen > 0) {
      chunks.push(current);
      current = "";
      currentLen = 0;
    }

    // If the paragraph itself fits in maxLen, start a new chunk with it
    if (paraLen <= maxLen) {
      current = para;
      currentLen = paraLen;
      continue;
    }

    // Paragraph exceeds maxLen: split by lines
    const lines = para.split("\n");
    for (const line of lines) {
      const lineLen = charCount(line);
      const lineSepLen = currentLen > 0 ? 1 : 0; // "\n"

      if (currentLen + lineSepLen + lineLen <= maxLen) {
        if (lineSepLen > 0) {
          current += "\n";
        }
        current += line;
        currentLen += lineSepLen + lineLen;
        continue;
      }

      if (currentLen > 0) {
        chunks.push(current);
        current = "";
        currentLen = 0;
      }

      if (lineLen <= maxLen) {
        current = line;
        currentLen = lineLen;
        continue;
      }

      // Single line exceeds maxLen: force split by character count
      splitByChars(line, maxLen, chunks);
    }
  }

  if (currentLen > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Count the number of Unicode code points in a string.
 * Uses spread syntax to correctly handle surrogate pairs (emoji, etc.).
 */
function charCount(s: string): number {
  return [...s].length;
}

/**
 * Split a string into chunks of at most maxLen characters (code points),
 * ensuring multi-byte characters are never cut in the middle.
 */
function splitByChars(s: string, maxLen: number, chunks: string[]): void {
  const chars = [...s];
  while (chars.length > 0) {
    const end = Math.min(maxLen, chars.length);
    chunks.push(chars.splice(0, end).join(""));
  }
}
