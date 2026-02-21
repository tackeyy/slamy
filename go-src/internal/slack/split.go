package slack

import (
	"strings"
	"unicode/utf8"
)

// MaxMessageLength is the maximum character (rune) count for a single Slack message.
const MaxMessageLength = 4000

// SplitMessage splits text into chunks of at most maxLen runes.
// It splits at paragraph boundaries (\n\n) first, then at line boundaries (\n),
// and finally by rune count if a single line exceeds maxLen.
func SplitMessage(text string, maxLen int) []string {
	if utf8.RuneCountInString(text) <= maxLen {
		return []string{text}
	}

	paragraphs := strings.Split(text, "\n\n")
	var chunks []string
	var current strings.Builder
	currentRunes := 0

	for _, para := range paragraphs {
		paraRunes := utf8.RuneCountInString(para)
		sepRunes := 0
		if currentRunes > 0 {
			sepRunes = 2 // "\n\n"
		}

		if currentRunes+sepRunes+paraRunes <= maxLen {
			if sepRunes > 0 {
				current.WriteString("\n\n")
			}
			current.WriteString(para)
			currentRunes += sepRunes + paraRunes
			continue
		}

		// Flush current chunk if non-empty
		if currentRunes > 0 {
			chunks = append(chunks, current.String())
			current.Reset()
			currentRunes = 0
		}

		// If the paragraph itself fits in maxLen, start a new chunk with it
		if paraRunes <= maxLen {
			current.WriteString(para)
			currentRunes = paraRunes
			continue
		}

		// Paragraph exceeds maxLen: split by lines
		lines := strings.Split(para, "\n")
		for _, line := range lines {
			lineRunes := utf8.RuneCountInString(line)
			sepRunes := 0
			if currentRunes > 0 {
				sepRunes = 1 // "\n"
			}

			if currentRunes+sepRunes+lineRunes <= maxLen {
				if sepRunes > 0 {
					current.WriteString("\n")
				}
				current.WriteString(line)
				currentRunes += sepRunes + lineRunes
				continue
			}

			if currentRunes > 0 {
				chunks = append(chunks, current.String())
				current.Reset()
				currentRunes = 0
			}

			if lineRunes <= maxLen {
				current.WriteString(line)
				currentRunes = lineRunes
				continue
			}

			// Single line exceeds maxLen: force split by rune count
			splitByRunes(line, maxLen, &chunks)
		}
	}

	if currentRunes > 0 {
		chunks = append(chunks, current.String())
	}

	return chunks
}

// splitByRunes splits a string into chunks of at most maxLen runes,
// ensuring multi-byte characters are never cut in the middle.
func splitByRunes(s string, maxLen int, chunks *[]string) {
	runes := []rune(s)
	for len(runes) > 0 {
		end := maxLen
		if end > len(runes) {
			end = len(runes)
		}
		*chunks = append(*chunks, string(runes[:end]))
		runes = runes[end:]
	}
}
