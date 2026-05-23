/**
 * Maximum character (rune) count for a single Slack message.
 *
 * Slack's `chat.postMessage` officially allows up to 40,000 characters
 * (https://docs.slack.dev/changelog/2018-truncating-really-long-messages/),
 * but `chat.update` is undocumented and empirically fails with
 * `msg_too_long` at around 4,000 characters. We use a defensive margin
 * (3,900) to cover ambiguities in Slack's character counting (entity
 * expansion of `<@U...>` mentions and `<https://...|title>` links may
 * inflate the on-server length beyond what `[...text].length` reports).
 *
 * Empirical evidence: navibot req_20260523165417_5b15b837 (2026-05-24 01:56 JST)
 * — Slack returned `msg_too_long` for a `chat.update` payload that passed the
 * 4,000-codepoint check on the client side.
 */
export const MAX_MESSAGE_LENGTH = 3900;

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
