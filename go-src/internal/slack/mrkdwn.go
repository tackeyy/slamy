package slack

import "regexp"

// Pre-compiled regexes for FixSlackMrkdwn transformations.
var (
	// Step 1: Convert Markdown **bold** to Slack *bold*, normalizing trailing fullwidth colon.
	reDoubleBold = regexp.MustCompile(`\*\*([^*]+)\*\*(\x{ff1a})?`)

	// Step 2: Normalize fullwidth colon after single bold: *text*： → *text*: (with space)
	reFullwidthColon = regexp.MustCompile(`(\*[^*\n]+\*)\x{ff1a}`)

	// Step 3: Insert space between bold close and non-ASCII char: *text*（ → *text* （
	reNonASCIIAfterBold = regexp.MustCompile(`(\*[^*\n]+\*)([^\x00-\x7f])`)
)

// FixSlackMrkdwn fixes common Slack mrkdwn formatting issues.
//
// Slack's mrkdwn renderer fails to apply bold when a fullwidth character
// immediately follows the closing asterisk. This function applies three
// regex-based transformations:
//  1. Convert Markdown **bold** to Slack *bold* (with optional fullwidth colon normalization)
//  2. Normalize fullwidth colon (：) after bold to halfwidth colon with space
//  3. Insert space between bold close marker and any non-ASCII character
func FixSlackMrkdwn(text string) string {
	// Step 1: **bold**（optional ：） → *bold*: or *bold*
	text = reDoubleBold.ReplaceAllStringFunc(text, func(match string) string {
		sub := reDoubleBold.FindStringSubmatch(match)
		if len(sub) < 2 {
			return match
		}
		inner := sub[1]
		if len(sub) >= 3 && sub[2] == "\uff1a" {
			return "*" + inner + "*: "
		}
		return "*" + inner + "*"
	})

	// Step 2: *bold*： → *bold*: (space after halfwidth colon)
	text = reFullwidthColon.ReplaceAllString(text, "${1}: ")

	// Step 3: *bold*（non-ASCII） → *bold* （non-ASCII）
	text = reNonASCIIAfterBold.ReplaceAllString(text, "${1} ${2}")

	return text
}
