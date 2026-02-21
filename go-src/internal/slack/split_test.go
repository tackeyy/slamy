package slack

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSplitMessage_ShortMessage(t *testing.T) {
	text := "Hello, world!"
	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0] != text {
		t.Errorf("expected %q, got %q", text, chunks[0])
	}
}

func TestSplitMessage_EmptyText(t *testing.T) {
	chunks := SplitMessage("", MaxMessageLength)

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0] != "" {
		t.Errorf("expected empty string, got %q", chunks[0])
	}
}

func TestSplitMessage_ExactlyMaxLen(t *testing.T) {
	text := strings.Repeat("a", MaxMessageLength)
	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0] != text {
		t.Errorf("expected text of length %d, got length %d", MaxMessageLength, len(chunks[0]))
	}
}

func TestSplitMessage_ParagraphBoundary(t *testing.T) {
	para1 := strings.Repeat("a", 2500)
	para2 := strings.Repeat("b", 2500)
	text := para1 + "\n\n" + para2

	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks, got %d", len(chunks))
	}
	if chunks[0] != para1 {
		t.Errorf("chunk[0] length = %d, want %d", len(chunks[0]), len(para1))
	}
	if chunks[1] != para2 {
		t.Errorf("chunk[1] length = %d, want %d", len(chunks[1]), len(para2))
	}
}

func TestSplitMessage_LineBoundary(t *testing.T) {
	line1 := strings.Repeat("x", 2500)
	line2 := strings.Repeat("y", 2500)
	text := line1 + "\n" + line2

	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks, got %d", len(chunks))
	}
	if chunks[0] != line1 {
		t.Errorf("chunk[0] = %q..., want line1", chunks[0][:20])
	}
	if chunks[1] != line2 {
		t.Errorf("chunk[1] = %q..., want line2", chunks[1][:20])
	}
}

func TestSplitMessage_ForceSplitLongLine(t *testing.T) {
	text := strings.Repeat("z", 10000)

	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d", len(chunks))
	}
	if utf8.RuneCountInString(chunks[0]) != MaxMessageLength {
		t.Errorf("chunk[0] runes = %d, want %d", utf8.RuneCountInString(chunks[0]), MaxMessageLength)
	}
	if utf8.RuneCountInString(chunks[1]) != MaxMessageLength {
		t.Errorf("chunk[1] runes = %d, want %d", utf8.RuneCountInString(chunks[1]), MaxMessageLength)
	}
	if utf8.RuneCountInString(chunks[2]) != 2000 {
		t.Errorf("chunk[2] runes = %d, want 2000", utf8.RuneCountInString(chunks[2]))
	}
}

func TestSplitMessage_MultipleParagraphsFitInOneChunk(t *testing.T) {
	text := "para1\n\npara2\n\npara3"
	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0] != text {
		t.Errorf("expected original text preserved, got %q", chunks[0])
	}
}

func TestSplitMessage_ThreeParagraphsSplit(t *testing.T) {
	para1 := strings.Repeat("a", 2000)
	para2 := strings.Repeat("b", 2000)
	para3 := strings.Repeat("c", 2000)
	text := para1 + "\n\n" + para2 + "\n\n" + para3

	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d", len(chunks))
	}
}

func TestSplitMessage_MixedParagraphsAndLines(t *testing.T) {
	small := "header info"
	bigLine1 := strings.Repeat("m", 3000)
	bigLine2 := strings.Repeat("n", 3000)
	bigPara := bigLine1 + "\n" + bigLine2
	text := small + "\n\n" + bigPara

	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 chunks, got %d", len(chunks))
	}
	if chunks[0] != small {
		t.Errorf("chunk[0] = %q, want %q", chunks[0], small)
	}
}

func TestSplitMessage_PreservesContent(t *testing.T) {
	para1 := strings.Repeat("a", 3000)
	para2 := strings.Repeat("b", 3000)
	text := para1 + "\n\n" + para2

	chunks := SplitMessage(text, MaxMessageLength)

	total := 0
	for _, c := range chunks {
		total += utf8.RuneCountInString(c)
	}
	if total != utf8.RuneCountInString(para1)+utf8.RuneCountInString(para2) {
		t.Errorf("total rune count = %d, want %d", total, utf8.RuneCountInString(para1)+utf8.RuneCountInString(para2))
	}
}

func TestSplitMessage_NoChunkExceedsMaxLen(t *testing.T) {
	texts := []string{
		strings.Repeat("a", 12000),
		strings.Repeat("x", 3000) + "\n\n" + strings.Repeat("y", 5000) + "\n\n" + strings.Repeat("z", 3000),
		strings.Repeat("line\n", 2000),
	}

	for i, text := range texts {
		chunks := SplitMessage(text, MaxMessageLength)
		for j, chunk := range chunks {
			runeCount := utf8.RuneCountInString(chunk)
			if runeCount > MaxMessageLength {
				t.Errorf("text[%d] chunk[%d] runes = %d, exceeds max %d", i, j, runeCount, MaxMessageLength)
			}
		}
	}
}

// --- Japanese / multi-byte character tests ---

func TestSplitMessage_JapaneseText(t *testing.T) {
	// 4000文字のひらがな（UTF-8で1文字3バイト = 12000バイト）
	jp := strings.Repeat("あ", 4000)
	chunks := SplitMessage(jp, MaxMessageLength)

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk for 4000 Japanese chars, got %d", len(chunks))
	}
}

func TestSplitMessage_JapaneseSplit(t *testing.T) {
	// 各段落2500文字の日本語 → 2チャンクに分割
	para1 := strings.Repeat("あ", 2500)
	para2 := strings.Repeat("い", 2500)
	text := para1 + "\n\n" + para2

	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks, got %d", len(chunks))
	}
	if chunks[0] != para1 {
		t.Error("chunk[0] should be all あ")
	}
	if chunks[1] != para2 {
		t.Error("chunk[1] should be all い")
	}
}

func TestSplitMessage_JapaneseForceSplit(t *testing.T) {
	// 改行なしの5000文字日本語 → 強制分割で文字化けしないこと
	text := strings.Repeat("漢", 5000)
	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks, got %d", len(chunks))
	}
	if utf8.RuneCountInString(chunks[0]) != 4000 {
		t.Errorf("chunk[0] runes = %d, want 4000", utf8.RuneCountInString(chunks[0]))
	}
	if utf8.RuneCountInString(chunks[1]) != 1000 {
		t.Errorf("chunk[1] runes = %d, want 1000", utf8.RuneCountInString(chunks[1]))
	}
	// 全チャンクが有効なUTF-8であること
	for i, chunk := range chunks {
		if !utf8.ValidString(chunk) {
			t.Errorf("chunk[%d] contains invalid UTF-8", i)
		}
	}
}

func TestSplitMessage_EmojiSplit(t *testing.T) {
	// 絵文字（4バイトUTF-8）を含むテキストが正しく分割されること
	emoji := "🔴"
	text := strings.Repeat(emoji, 5000)
	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks, got %d", len(chunks))
	}
	for i, chunk := range chunks {
		if !utf8.ValidString(chunk) {
			t.Errorf("chunk[%d] contains invalid UTF-8 (emoji split corruption)", i)
		}
	}
	if utf8.RuneCountInString(chunks[0]) != 4000 {
		t.Errorf("chunk[0] runes = %d, want 4000", utf8.RuneCountInString(chunks[0]))
	}
}

func TestSplitMessage_RealisticCRMReport(t *testing.T) {
	// Slack投稿レポートに近い形式（日本語+絵文字+メンション混在）
	header := "📋 *チェック結果*\n実行日: 2026-01-01\n対象: サンプルデータ\n不備件数: 50件 / 100件中"
	var sections []string
	for i := 0; i < 30; i++ {
		section := "🔴 *<@UXXXXXXXXX" + string(rune('A'+i%26)) + ">*\n"
		for j := 0; j < 8; j++ {
			section += "• テスト項目" + string(rune('A'+j)) + " - 未対応\n"
		}
		sections = append(sections, section)
	}
	text := header + "\n\n" + strings.Join(sections, "\n\n")

	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 chunks for CRM report, got %d", len(chunks))
	}
	for i, chunk := range chunks {
		runeCount := utf8.RuneCountInString(chunk)
		if runeCount > MaxMessageLength {
			t.Errorf("chunk[%d] runes = %d, exceeds max %d", i, runeCount, MaxMessageLength)
		}
		if !utf8.ValidString(chunk) {
			t.Errorf("chunk[%d] contains invalid UTF-8", i)
		}
		if runeCount == 0 {
			t.Errorf("chunk[%d] is empty", i)
		}
	}
}

// --- Edge cases ---

func TestSplitMessage_ConsecutiveEmptyParagraphs(t *testing.T) {
	// \n\n\n\n は空段落を含む
	text := "start\n\n\n\nend"
	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0] != text {
		t.Errorf("expected %q, got %q", text, chunks[0])
	}
}

func TestSplitMessage_TrailingNewlines(t *testing.T) {
	text := strings.Repeat("a", 3999) + "\n\n"
	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk (3999 + 2 newlines = 4001 runes but split as 3999 + empty), got %d", len(chunks))
	}
}

func TestSplitMessage_OnlyNewlines(t *testing.T) {
	text := strings.Repeat("\n", 100)
	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
}

func TestSplitMessage_MaxLenPlusOne(t *testing.T) {
	// ちょうど maxLen+1 文字 → 2チャンクに分割
	text := strings.Repeat("a", MaxMessageLength) + "\n\nb"
	chunks := SplitMessage(text, MaxMessageLength)

	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks, got %d", len(chunks))
	}
	if chunks[0] != strings.Repeat("a", MaxMessageLength) {
		t.Error("chunk[0] should be all a's")
	}
	if chunks[1] != "b" {
		t.Errorf("chunk[1] = %q, want %q", chunks[1], "b")
	}
}
