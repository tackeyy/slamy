/**
 * Pre-compiled regexes for fixSlackMrkdwn transformations.
 */

// Step 1: Convert Markdown **bold** to Slack *bold*, normalizing trailing fullwidth colon.
const reDoubleBold = /\*\*([^*]+)\*\*(\uff1a)?/g;

// Step 2: Normalize fullwidth colon after single bold: *text*： → *text*: (with space)
const reFullwidthColon = /(\*[^*\n]+\*)\uff1a/g;

// Step 3: Insert space between bold close and non-ASCII char: *text*（ → *text* （
const reNonASCIIAfterBold = /(\*[^*\n]+\*)([^\x00-\x7f])/g;

/**
 * Fix common Slack mrkdwn formatting issues.
 *
 * Slack's mrkdwn renderer fails to apply bold when a fullwidth character
 * immediately follows the closing asterisk. This function applies three
 * regex-based transformations:
 *  1. Convert Markdown **bold** to Slack *bold* (with optional fullwidth colon normalization)
 *  2. Normalize fullwidth colon (：) after bold to halfwidth colon with space
 *  3. Insert space between bold close marker and any non-ASCII character
 */
export function fixSlackMrkdwn(text: string): string {
  // Step 1: **bold**(optional ：) → *bold*: or *bold*
  let result = text.replace(reDoubleBold, (_match, inner: string, colon?: string) => {
    if (colon === "\uff1a") {
      return `*${inner}*: `;
    }
    return `*${inner}*`;
  });

  // Step 2: *bold*： → *bold*: (space after halfwidth colon)
  result = result.replace(reFullwidthColon, "$1: ");

  // Step 3: *bold*（non-ASCII） → *bold* （non-ASCII）
  result = result.replace(reNonASCIIAfterBold, "$1 $2");

  return result;
}
