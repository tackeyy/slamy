package cmd

import (
	"fmt"
	"strings"
	"testing"

	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

func setSearchMockClient(mock *slackutil.MockSlackAPI) func() {
	orig := searchClientFunc
	searchClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: mock}, nil
	}
	return func() { searchClientFunc = orig }
}

func setSearchClientError(errMsg string) func() {
	orig := searchClientFunc
	searchClientFunc = func() (*slackutil.Client, error) {
		return nil, fmt.Errorf("%s", errMsg)
	}
	return func() { searchClientFunc = orig }
}

// setSearchClientNoUser simulates a state where botToken-only Client is used.
func setSearchClientNoUser() func() {
	orig := searchClientFunc
	searchClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: nil}, nil
	}
	return func() { searchClientFunc = orig }
}

func resetSearchFlags(t *testing.T) func() {
	t.Helper()
	for _, kv := range [][2]string{
		{"count", "20"}, {"page", "1"}, {"sort", "timestamp"}, {"sort-dir", "desc"},
	} {
		if err := searchMessagesCmd.Flags().Set(kv[0], kv[1]); err != nil {
			t.Fatalf("reset --%s: %v", kv[0], err)
		}
	}
	return func() {
		for _, kv := range [][2]string{
			{"count", "20"}, {"page", "1"}, {"sort", "timestamp"}, {"sort-dir", "desc"},
		} {
			if err := searchMessagesCmd.Flags().Set(kv[0], kv[1]); err != nil {
				t.Errorf("reset --%s: %v", kv[0], err)
			}
		}
	}
}

func sampleSearchResult() *slackapi.SearchMessages {
	return &slackapi.SearchMessages{
		Matches: []slackapi.SearchMessage{
			{
				Type:      "message",
				Channel:   slackapi.CtxChannel{ID: "C001", Name: "general"},
				User:      "U001",
				Username:  "alice",
				Timestamp: "1700000000.000001",
				Text:      "hello world",
				Permalink: "https://example.slack.com/archives/C001/p1700000000000001",
			},
			{
				Type:      "message",
				Channel:   slackapi.CtxChannel{ID: "C002", Name: "random"},
				User:      "U002",
				Username:  "bob",
				Timestamp: "1700000001.000002",
				Text:      "hi there\nmulti line",
				Permalink: "https://example.slack.com/archives/C002/p1700000001000002",
			},
		},
		Paging: slackapi.Paging{Page: 1},
		Total:  2,
	}
}

// ---------- searchMessagesCmd ----------

func TestSearchMessages_HumanOutput(t *testing.T) {
	var capturedQuery string
	var capturedParams slackapi.SearchParameters
	cleanup := setSearchMockClient(&slackutil.MockSlackAPI{
		SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
			capturedQuery = query
			capturedParams = params
			return sampleSearchResult(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetSearchFlags(t)()

	out, err := captureStdout(t, func() error {
		return searchMessagesCmd.RunE(searchMessagesCmd, []string{"hello"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "Found 2 results (page 1)") {
		t.Errorf("expected header in output, got %q", out)
	}
	if !strings.Contains(out, "#general U001:") {
		t.Errorf("expected '#general U001:' in output, got %q", out)
	}
	if !strings.Contains(out, "hello world") {
		t.Errorf("expected first match text, got %q", out)
	}
	if capturedQuery != "hello" {
		t.Errorf("expected query='hello', got %q", capturedQuery)
	}
	if capturedParams.Count != 20 || capturedParams.Page != 1 {
		t.Errorf("expected defaults count=20 page=1, got %+v", capturedParams)
	}
	if capturedParams.Sort != "timestamp" || capturedParams.SortDirection != "desc" {
		t.Errorf("expected defaults sort=timestamp sort-dir=desc, got %+v", capturedParams)
	}
}

func TestSearchMessages_JSONOutput(t *testing.T) {
	cleanup := setSearchMockClient(&slackutil.MockSlackAPI{
		SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
			return sampleSearchResult(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetSearchFlags(t)()

	outputJSON = true

	out, err := captureStdout(t, func() error {
		return searchMessagesCmd.RunE(searchMessagesCmd, []string{"hello"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{
		`"ts": "1700000000.000001"`,
		`"channel": "general"`,
		`"channel_id": "C001"`,
		`"user": "U001"`,
		`"text": "hello world"`,
		`"total": 2`,
		`"page": 1`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON output, got %q", want, out)
		}
	}
}

func TestSearchMessages_PlainOutput(t *testing.T) {
	cleanup := setSearchMockClient(&slackutil.MockSlackAPI{
		SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
			return sampleSearchResult(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetSearchFlags(t)()

	outputPlain = true

	out, err := captureStdout(t, func() error {
		return searchMessagesCmd.RunE(searchMessagesCmd, []string{"hello"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 2 matches × 1 line each
	if strings.Count(out, "\n") != 2 {
		t.Errorf("expected 2 lines, got %q", out)
	}
	if !strings.Contains(out, "1700000000.000001\tC001\tgeneral\tU001\thello world\t") {
		t.Errorf("expected first plain line, got %q", out)
	}
	// newline replaced with literal \n
	if !strings.Contains(out, "hi there\\nmulti line") {
		t.Errorf("expected newline replaced, got %q", out)
	}
}

func TestSearchMessages_FlagsPassedThrough(t *testing.T) {
	var capturedParams slackapi.SearchParameters
	cleanup := setSearchMockClient(&slackutil.MockSlackAPI{
		SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
			capturedParams = params
			return sampleSearchResult(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetSearchFlags(t)()

	if err := searchMessagesCmd.Flags().Set("count", "50"); err != nil {
		t.Fatalf("set --count: %v", err)
	}
	if err := searchMessagesCmd.Flags().Set("page", "3"); err != nil {
		t.Fatalf("set --page: %v", err)
	}
	if err := searchMessagesCmd.Flags().Set("sort", "score"); err != nil {
		t.Fatalf("set --sort: %v", err)
	}
	if err := searchMessagesCmd.Flags().Set("sort-dir", "asc"); err != nil {
		t.Fatalf("set --sort-dir: %v", err)
	}

	if _, err := captureStdout(t, func() error {
		return searchMessagesCmd.RunE(searchMessagesCmd, []string{"q"})
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedParams.Count != 50 || capturedParams.Page != 3 {
		t.Errorf("expected count=50 page=3, got %+v", capturedParams)
	}
	if capturedParams.Sort != "score" || capturedParams.SortDirection != "asc" {
		t.Errorf("expected sort=score sort-dir=asc, got %+v", capturedParams)
	}
}

func TestSearchMessages_LongTextTruncation(t *testing.T) {
	long := strings.Repeat("a", 250)
	cleanup := setSearchMockClient(&slackutil.MockSlackAPI{
		SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
			return &slackapi.SearchMessages{
				Matches: []slackapi.SearchMessage{
					{
						Channel:   slackapi.CtxChannel{ID: "C001", Name: "g"},
						User:      "U001",
						Timestamp: "1700000000.000001",
						Text:      long,
						Permalink: "https://example.slack.com/x",
					},
				},
				Paging: slackapi.Paging{Page: 1},
				Total:  1,
			}, nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetSearchFlags(t)()

	out, err := captureStdout(t, func() error {
		return searchMessagesCmd.RunE(searchMessagesCmd, []string{"q"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "..."+"") {
		t.Errorf("expected truncation marker '...', got %q", out)
	}
	// Should contain exactly 200 'a's + "...", not full 250
	if strings.Contains(out, strings.Repeat("a", 220)) {
		t.Error("expected text truncated to 200 chars, but found more")
	}
}

func TestSearchMessages_ClientError(t *testing.T) {
	cleanup := setSearchClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := searchMessagesCmd.RunE(searchMessagesCmd, []string{"q"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "missing SLACK_USER_TOKEN") {
		t.Errorf("expected client error wrapped, got %v", err)
	}
}

func TestSearchMessages_NoUserTokenError(t *testing.T) {
	cleanup := setSearchClientNoUser()
	defer cleanup()
	defer resetOutputFlags(t)()

	err := searchMessagesCmd.RunE(searchMessagesCmd, []string{"q"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "SLACK_USER_TOKEN is required") {
		t.Errorf("expected 'SLACK_USER_TOKEN is required', got %v", err)
	}
}

func TestSearchMessages_APIError(t *testing.T) {
	cleanup := setSearchMockClient(&slackutil.MockSlackAPI{
		SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
			return nil, fmt.Errorf("rate_limited")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetSearchFlags(t)()

	err := searchMessagesCmd.RunE(searchMessagesCmd, []string{"q"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "search failed") {
		t.Errorf("expected 'search failed', got %v", err)
	}
	if !strings.Contains(err.Error(), "rate_limited") {
		t.Errorf("expected wrapped API error, got %v", err)
	}
}
