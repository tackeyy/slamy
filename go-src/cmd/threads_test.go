package cmd

import (
	"fmt"
	"strings"
	"testing"

	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

// setThreadsMockClient replaces threadsClientFunc with a mock-based client.
func setThreadsMockClient(mock *slackutil.MockSlackAPI) func() {
	orig := threadsClientFunc
	threadsClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: mock}, nil
	}
	return func() { threadsClientFunc = orig }
}

func setThreadsClientError(errMsg string) func() {
	orig := threadsClientFunc
	threadsClientFunc = func() (*slackutil.Client, error) {
		return nil, fmt.Errorf("%s", errMsg)
	}
	return func() { threadsClientFunc = orig }
}

func resetThreadsFlags(t *testing.T) func() {
	t.Helper()
	if err := threadsRepliesCmd.Flags().Set("limit", "50"); err != nil {
		t.Fatalf("failed to reset --limit flag: %v", err)
	}
	return func() {
		if err := threadsRepliesCmd.Flags().Set("limit", "50"); err != nil {
			t.Errorf("failed to reset --limit flag: %v", err)
		}
	}
}

func sampleReplies() []slackapi.Message {
	return []slackapi.Message{
		{Msg: slackapi.Msg{Timestamp: "1700000000.000001", User: "U001", Text: "first reply"}},
		{Msg: slackapi.Msg{Timestamp: "1700000010.000002", User: "U002", Text: "second\nreply"}},
	}
}

// ---------- threadsRepliesCmd ----------

func TestThreadsReplies_HumanOutput(t *testing.T) {
	var capturedParams *slackapi.GetConversationRepliesParameters
	cleanup := setThreadsMockClient(&slackutil.MockSlackAPI{
		GetConversationRepliesFunc: func(params *slackapi.GetConversationRepliesParameters) ([]slackapi.Message, bool, string, error) {
			capturedParams = params
			return sampleReplies(), false, "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetThreadsFlags(t)()

	out, err := captureStdout(t, func() error {
		return threadsRepliesCmd.RunE(threadsRepliesCmd, []string{"C123", "1700000000.000001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "U001: first reply") {
		t.Errorf("expected first reply text, got %q", out)
	}
	if !strings.Contains(out, "U002: second\nreply") {
		t.Errorf("expected second reply text (with newline preserved), got %q", out)
	}
	if capturedParams == nil || capturedParams.ChannelID != "C123" || capturedParams.Timestamp != "1700000000.000001" {
		t.Errorf("unexpected captured params: %+v", capturedParams)
	}
	if capturedParams.Limit != 50 {
		t.Errorf("expected default limit 50, got %d", capturedParams.Limit)
	}
}

func TestThreadsReplies_JSONOutput(t *testing.T) {
	cleanup := setThreadsMockClient(&slackutil.MockSlackAPI{
		GetConversationRepliesFunc: func(params *slackapi.GetConversationRepliesParameters) ([]slackapi.Message, bool, string, error) {
			return sampleReplies(), false, "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetThreadsFlags(t)()

	outputJSON = true

	out, err := captureStdout(t, func() error {
		return threadsRepliesCmd.RunE(threadsRepliesCmd, []string{"C123", "1700000000.000001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{`"ts": "1700000000.000001"`, `"user": "U001"`, `"text": "first reply"`, `"text": "second\nreply"`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON output, got %q", want, out)
		}
	}
}

func TestThreadsReplies_PlainOutput(t *testing.T) {
	cleanup := setThreadsMockClient(&slackutil.MockSlackAPI{
		GetConversationRepliesFunc: func(params *slackapi.GetConversationRepliesParameters) ([]slackapi.Message, bool, string, error) {
			return sampleReplies(), false, "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetThreadsFlags(t)()

	outputPlain = true

	out, err := captureStdout(t, func() error {
		return threadsRepliesCmd.RunE(threadsRepliesCmd, []string{"C123", "1700000000.000001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// plain mode replaces newlines with literal \n
	expected := "1700000000.000001\tU001\tfirst reply\n1700000010.000002\tU002\tsecond\\nreply\n"
	if out != expected {
		t.Errorf("expected plain output %q, got %q", expected, out)
	}
}

func TestThreadsReplies_LimitFlag(t *testing.T) {
	var capturedLimit int
	cleanup := setThreadsMockClient(&slackutil.MockSlackAPI{
		GetConversationRepliesFunc: func(params *slackapi.GetConversationRepliesParameters) ([]slackapi.Message, bool, string, error) {
			capturedLimit = params.Limit
			return nil, false, "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetThreadsFlags(t)()

	if err := threadsRepliesCmd.Flags().Set("limit", "5"); err != nil {
		t.Fatalf("set --limit: %v", err)
	}

	if _, err := captureStdout(t, func() error {
		return threadsRepliesCmd.RunE(threadsRepliesCmd, []string{"C123", "1700000000.000001"})
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedLimit != 5 {
		t.Errorf("expected limit=5, got %d", capturedLimit)
	}
}

func TestThreadsReplies_ClientError(t *testing.T) {
	cleanup := setThreadsClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := threadsRepliesCmd.RunE(threadsRepliesCmd, []string{"C123", "1700000000.000001"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "missing SLACK_USER_TOKEN") {
		t.Errorf("expected client error wrapped, got %v", err)
	}
}

func TestThreadsReplies_APIError(t *testing.T) {
	cleanup := setThreadsMockClient(&slackutil.MockSlackAPI{
		GetConversationRepliesFunc: func(params *slackapi.GetConversationRepliesParameters) ([]slackapi.Message, bool, string, error) {
			return nil, false, "", fmt.Errorf("thread_not_found")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetThreadsFlags(t)()

	err := threadsRepliesCmd.RunE(threadsRepliesCmd, []string{"C123", "1700000000.000001"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to get replies") {
		t.Errorf("expected 'failed to get replies' in error, got %v", err)
	}
	if !strings.Contains(err.Error(), "thread_not_found") {
		t.Errorf("expected API error wrapped, got %v", err)
	}
}
