/** Maximum character (rune) count for a single Slack message. */
export const MAX_MESSAGE_LENGTH = 4000;

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
