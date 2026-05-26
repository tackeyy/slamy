package cmd

import (
	"fmt"
	"strings"
	"testing"

	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

// setMessagesMockClient replaces messagesClientFunc with a mock-based client.
func setMessagesMockClient(mock *slackutil.MockSlackAPI) func() {
	orig := messagesClientFunc
	messagesClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: mock}, nil
	}
	return func() { messagesClientFunc = orig }
}

func setMessagesClientError(errMsg string) func() {
	orig := messagesClientFunc
	messagesClientFunc = func() (*slackutil.Client, error) {
		return nil, fmt.Errorf("%s", errMsg)
	}
	return func() { messagesClientFunc = orig }
}

func resetMessagesPostFlags(t *testing.T) func() {
	t.Helper()
	if err := messagesPostCmd.Flags().Set("text", ""); err != nil {
		t.Fatalf("reset --text: %v", err)
	}
	return func() {
		if err := messagesPostCmd.Flags().Set("text", ""); err != nil {
			t.Errorf("reset --text: %v", err)
		}
	}
}

func resetMessagesReplyFlags(t *testing.T) func() {
	t.Helper()
	if err := messagesReplyCmd.Flags().Set("text", ""); err != nil {
		t.Fatalf("reset --text: %v", err)
	}
	if err := messagesReplyCmd.Flags().Set("broadcast", "false"); err != nil {
		t.Fatalf("reset --broadcast: %v", err)
	}
	return func() {
		if err := messagesReplyCmd.Flags().Set("text", ""); err != nil {
			t.Errorf("reset --text: %v", err)
		}
		if err := messagesReplyCmd.Flags().Set("broadcast", "false"); err != nil {
			t.Errorf("reset --broadcast: %v", err)
		}
	}
}

// ---------- messagesPostCmd ----------

func TestMessagesPost_HumanOutput(t *testing.T) {
	var postCalls int
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			postCalls++
			return channelID, "1700000000.000001", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesPostFlags(t)()

	if err := messagesPostCmd.Flags().Set("text", "hello"); err != nil {
		t.Fatalf("set --text: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return messagesPostCmd.RunE(messagesPostCmd, []string{"C123"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "Message posted to C123 (ts: 1700000000.000001)") {
		t.Errorf("expected post summary, got %q", out)
	}
	if postCalls != 1 {
		t.Errorf("expected 1 PostMessage call, got %d", postCalls)
	}
}

func TestMessagesPost_JSONOutput(t *testing.T) {
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			return channelID, "1700000000.000001", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesPostFlags(t)()

	outputJSON = true
	if err := messagesPostCmd.Flags().Set("text", "hi"); err != nil {
		t.Fatalf("set --text: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return messagesPostCmd.RunE(messagesPostCmd, []string{"C999"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{`"channel": "C999"`, `"ts": "1700000000.000001"`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON output, got %q", want, out)
		}
	}
}

func TestMessagesPost_PlainOutput(t *testing.T) {
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			return channelID, "1700000000.111111", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesPostFlags(t)()

	outputPlain = true
	if err := messagesPostCmd.Flags().Set("text", "x"); err != nil {
		t.Fatalf("set --text: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return messagesPostCmd.RunE(messagesPostCmd, []string{"C222"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "C222\t1700000000.111111\n"
	if out != expected {
		t.Errorf("expected plain output %q, got %q", expected, out)
	}
}

func TestMessagesPost_MissingText(t *testing.T) {
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			t.Fatal("PostMessage should not be called when --text is missing")
			return "", "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesPostFlags(t)()

	err := messagesPostCmd.RunE(messagesPostCmd, []string{"C123"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "--text is required") {
		t.Errorf("expected '--text is required', got %v", err)
	}
}

func TestMessagesPost_ClientError(t *testing.T) {
	cleanup := setMessagesClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := messagesPostCmd.RunE(messagesPostCmd, []string{"C123"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "missing SLACK_USER_TOKEN") {
		t.Errorf("expected client error wrapped, got %v", err)
	}
}

func TestMessagesPost_APIError(t *testing.T) {
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			return "", "", fmt.Errorf("channel_not_found")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesPostFlags(t)()

	if err := messagesPostCmd.Flags().Set("text", "hi"); err != nil {
		t.Fatalf("set --text: %v", err)
	}

	err := messagesPostCmd.RunE(messagesPostCmd, []string{"BADCHAN"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to post message") {
		t.Errorf("expected 'failed to post message', got %v", err)
	}
	if !strings.Contains(err.Error(), "channel_not_found") {
		t.Errorf("expected wrapped API error, got %v", err)
	}
}

// ---------- messagesReplyCmd ----------

func TestMessagesReply_HumanOutput(t *testing.T) {
	var capturedChannel string
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			capturedChannel = channelID
			return channelID, "1700000001.000001", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesReplyFlags(t)()

	if err := messagesReplyCmd.Flags().Set("text", "reply body"); err != nil {
		t.Fatalf("set --text: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return messagesReplyCmd.RunE(messagesReplyCmd, []string{"C111", "1700000000.000001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "Reply posted to C111 thread 1700000000.000001") {
		t.Errorf("expected reply summary, got %q", out)
	}
	if capturedChannel != "C111" {
		t.Errorf("expected channel=C111 captured, got %q", capturedChannel)
	}
}

func TestMessagesReply_JSONOutput(t *testing.T) {
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			return channelID, "1700000001.000002", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesReplyFlags(t)()

	outputJSON = true
	if err := messagesReplyCmd.Flags().Set("text", "json reply"); err != nil {
		t.Fatalf("set --text: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return messagesReplyCmd.RunE(messagesReplyCmd, []string{"C222", "1700000000.000001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{`"channel": "C222"`, `"thread_ts": "1700000000.000001"`, `"ts": "1700000001.000002"`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON, got %q", want, out)
		}
	}
}

func TestMessagesReply_PlainOutput(t *testing.T) {
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			return channelID, "1700000001.222222", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesReplyFlags(t)()

	outputPlain = true
	if err := messagesReplyCmd.Flags().Set("text", "plain reply"); err != nil {
		t.Fatalf("set --text: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return messagesReplyCmd.RunE(messagesReplyCmd, []string{"C333", "1700000000.333333"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "C333\t1700000001.222222\t1700000000.333333\n"
	if out != expected {
		t.Errorf("expected plain %q, got %q", expected, out)
	}
}

func TestMessagesReply_MissingText(t *testing.T) {
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			t.Fatal("PostMessage should not be called")
			return "", "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesReplyFlags(t)()

	err := messagesReplyCmd.RunE(messagesReplyCmd, []string{"C111", "1700000000.000001"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "--text is required") {
		t.Errorf("expected '--text is required', got %v", err)
	}
}

func TestMessagesReply_BroadcastFlag(t *testing.T) {
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			// We can't easily introspect MsgOption directly. Just verify it doesn't panic.
			return channelID, "1700000001.444444", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesReplyFlags(t)()

	if err := messagesReplyCmd.Flags().Set("text", "broadcast me"); err != nil {
		t.Fatalf("set --text: %v", err)
	}
	if err := messagesReplyCmd.Flags().Set("broadcast", "true"); err != nil {
		t.Fatalf("set --broadcast: %v", err)
	}

	if _, err := captureStdout(t, func() error {
		return messagesReplyCmd.RunE(messagesReplyCmd, []string{"C444", "1700000000.000001"})
	}); err != nil {
		t.Fatalf("unexpected error with --broadcast: %v", err)
	}
}

func TestMessagesReply_ClientError(t *testing.T) {
	cleanup := setMessagesClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := messagesReplyCmd.RunE(messagesReplyCmd, []string{"C123", "1700000000.000001"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "missing SLACK_USER_TOKEN") {
		t.Errorf("expected client error wrapped, got %v", err)
	}
}

func TestMessagesReply_APIError(t *testing.T) {
	cleanup := setMessagesMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			return "", "", fmt.Errorf("thread_not_found")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetMessagesReplyFlags(t)()

	if err := messagesReplyCmd.Flags().Set("text", "x"); err != nil {
		t.Fatalf("set --text: %v", err)
	}

	err := messagesReplyCmd.RunE(messagesReplyCmd, []string{"C123", "1700000000.000001"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to reply") {
		t.Errorf("expected 'failed to reply', got %v", err)
	}
}
