package cmd

import (
	"fmt"
	"strings"
	"testing"

	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

func setChannelsMockClient(mock *slackutil.MockSlackAPI) func() {
	orig := channelsClientFunc
	channelsClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: mock}, nil
	}
	return func() { channelsClientFunc = orig }
}

func setChannelsClientError(errMsg string) func() {
	orig := channelsClientFunc
	channelsClientFunc = func() (*slackutil.Client, error) {
		return nil, fmt.Errorf("%s", errMsg)
	}
	return func() { channelsClientFunc = orig }
}

func resetChannelsListFlags(t *testing.T) func() {
	t.Helper()
	for _, kv := range [][2]string{
		{"limit", "100"}, {"include-archived", "false"}, {"unread", "false"},
	} {
		if err := channelsListCmd.Flags().Set(kv[0], kv[1]); err != nil {
			t.Fatalf("reset --%s: %v", kv[0], err)
		}
	}
	return func() {
		for _, kv := range [][2]string{
			{"limit", "100"}, {"include-archived", "false"}, {"unread", "false"},
		} {
			if err := channelsListCmd.Flags().Set(kv[0], kv[1]); err != nil {
				t.Errorf("reset --%s: %v", kv[0], err)
			}
		}
	}
}

func resetChannelsHistoryFlags(t *testing.T) func() {
	t.Helper()
	if err := channelsHistoryCmd.Flags().Set("limit", "20"); err != nil {
		t.Fatalf("reset --limit: %v", err)
	}
	return func() {
		if err := channelsHistoryCmd.Flags().Set("limit", "20"); err != nil {
			t.Errorf("reset --limit: %v", err)
		}
	}
}

func sampleChannelList() []slackapi.Channel {
	return []slackapi.Channel{
		{
			GroupConversation: slackapi.GroupConversation{
				Name:         "general",
				Conversation: slackapi.Conversation{ID: "C001", NumMembers: 10, IsPrivate: false},
			},
		},
		{
			GroupConversation: slackapi.GroupConversation{
				Name:         "secret",
				Conversation: slackapi.Conversation{ID: "C002", NumMembers: 5, IsPrivate: true},
			},
		},
	}
}

// ---------- channelsListCmd ----------

func TestChannelsList_HumanOutput(t *testing.T) {
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return &slackapi.AuthTestResponse{UserID: "U001", User: "alice"}, nil
		},
		GetConversationsForUserFunc: func(params *slackapi.GetConversationsForUserParameters) ([]slackapi.Channel, string, error) {
			return sampleChannelList(), "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsListFlags(t)()

	out, err := captureStdout(t, func() error {
		return channelsListCmd.RunE(channelsListCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "#general") || !strings.Contains(out, "C001") {
		t.Errorf("expected #general listing, got %q", out)
	}
	if !strings.Contains(out, "#secret") || !strings.Contains(out, "(private)") {
		t.Errorf("expected #secret with private marker, got %q", out)
	}
}

func TestChannelsList_JSONOutput(t *testing.T) {
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return &slackapi.AuthTestResponse{UserID: "U001"}, nil
		},
		GetConversationsForUserFunc: func(params *slackapi.GetConversationsForUserParameters) ([]slackapi.Channel, string, error) {
			return sampleChannelList(), "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsListFlags(t)()

	outputJSON = true

	out, err := captureStdout(t, func() error {
		return channelsListCmd.RunE(channelsListCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{`"id": "C001"`, `"name": "general"`, `"num_members": 10`, `"is_private": true`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON, got %q", want, out)
		}
	}
}

func TestChannelsList_PlainOutput(t *testing.T) {
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return &slackapi.AuthTestResponse{UserID: "U001"}, nil
		},
		GetConversationsForUserFunc: func(params *slackapi.GetConversationsForUserParameters) ([]slackapi.Channel, string, error) {
			return sampleChannelList(), "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsListFlags(t)()

	outputPlain = true

	out, err := captureStdout(t, func() error {
		return channelsListCmd.RunE(channelsListCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "C001\tgeneral\t10\t\t") {
		t.Errorf("expected C001 plain line, got %q", out)
	}
	if !strings.Contains(out, "C002\tsecret\t5\tprivate\t") {
		t.Errorf("expected C002 plain line with private marker, got %q", out)
	}
}

func TestChannelsList_Pagination(t *testing.T) {
	var calls int
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return &slackapi.AuthTestResponse{UserID: "U001"}, nil
		},
		GetConversationsForUserFunc: func(params *slackapi.GetConversationsForUserParameters) ([]slackapi.Channel, string, error) {
			calls++
			if calls == 1 {
				return []slackapi.Channel{
					{GroupConversation: slackapi.GroupConversation{Name: "page1", Conversation: slackapi.Conversation{ID: "C001"}}},
				}, "next_cursor_x", nil
			}
			return []slackapi.Channel{
				{GroupConversation: slackapi.GroupConversation{Name: "page2", Conversation: slackapi.Conversation{ID: "C002"}}},
			}, "", nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsListFlags(t)()

	out, err := captureStdout(t, func() error {
		return channelsListCmd.RunE(channelsListCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if calls != 2 {
		t.Errorf("expected 2 pagination calls, got %d", calls)
	}
	if !strings.Contains(out, "C001") || !strings.Contains(out, "C002") {
		t.Errorf("expected both pages, got %q", out)
	}
}

func TestChannelsList_AuthError(t *testing.T) {
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return nil, fmt.Errorf("invalid_auth")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsListFlags(t)()

	err := channelsListCmd.RunE(channelsListCmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to get auth info") {
		t.Errorf("expected 'failed to get auth info', got %v", err)
	}
}

func TestChannelsList_APIError(t *testing.T) {
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return &slackapi.AuthTestResponse{UserID: "U001"}, nil
		},
		GetConversationsForUserFunc: func(params *slackapi.GetConversationsForUserParameters) ([]slackapi.Channel, string, error) {
			return nil, "", fmt.Errorf("missing_scope")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsListFlags(t)()

	err := channelsListCmd.RunE(channelsListCmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to list channels") {
		t.Errorf("expected 'failed to list channels', got %v", err)
	}
}

func TestChannelsList_ClientError(t *testing.T) {
	cleanup := setChannelsClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := channelsListCmd.RunE(channelsListCmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// ---------- channelsHistoryCmd ----------

func sampleHistory() *slackapi.GetConversationHistoryResponse {
	return &slackapi.GetConversationHistoryResponse{
		Messages: []slackapi.Message{
			{Msg: slackapi.Msg{Timestamp: "1700000000.000001", User: "U001", Text: "hello"}},
			{Msg: slackapi.Msg{Timestamp: "1700000001.000002", User: "U002", Text: "world\nnewline", ThreadTimestamp: "1700000000.000001", ReplyCount: 3}},
		},
	}
}

func TestChannelsHistory_HumanOutput(t *testing.T) {
	var capturedParams *slackapi.GetConversationHistoryParameters
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			capturedParams = params
			return sampleHistory(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsHistoryFlags(t)()

	out, err := captureStdout(t, func() error {
		return channelsHistoryCmd.RunE(channelsHistoryCmd, []string{"C123"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedParams == nil || capturedParams.ChannelID != "C123" {
		t.Errorf("expected channel=C123 param, got %+v", capturedParams)
	}
	if capturedParams.Limit != 20 {
		t.Errorf("expected default limit 20, got %d", capturedParams.Limit)
	}
	if !strings.Contains(out, "U001: hello") {
		t.Errorf("expected first message, got %q", out)
	}
	if !strings.Contains(out, "U002: world") || !strings.Contains(out, "[3 replies]") {
		t.Errorf("expected second message with reply count, got %q", out)
	}
}

func TestChannelsHistory_JSONOutput(t *testing.T) {
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			return sampleHistory(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsHistoryFlags(t)()

	outputJSON = true

	out, err := captureStdout(t, func() error {
		return channelsHistoryCmd.RunE(channelsHistoryCmd, []string{"C123"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{`"ts": "1700000000.000001"`, `"user": "U001"`, `"text": "hello"`, `"thread_ts": "1700000000.000001"`, `"reply_count": 3`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON, got %q", want, out)
		}
	}
}

func TestChannelsHistory_PlainOutput(t *testing.T) {
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			return sampleHistory(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsHistoryFlags(t)()

	outputPlain = true

	out, err := captureStdout(t, func() error {
		return channelsHistoryCmd.RunE(channelsHistoryCmd, []string{"C123"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "1700000000.000001\tU001\thello\n") {
		t.Errorf("expected first plain line, got %q", out)
	}
	// newline replaced with literal \n
	if !strings.Contains(out, "world\\nnewline") {
		t.Errorf("expected newline replaced, got %q", out)
	}
}

func TestChannelsHistory_LimitFlag(t *testing.T) {
	var capturedLimit int
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			capturedLimit = params.Limit
			return sampleHistory(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsHistoryFlags(t)()

	if err := channelsHistoryCmd.Flags().Set("limit", "100"); err != nil {
		t.Fatalf("set --limit: %v", err)
	}

	if _, err := captureStdout(t, func() error {
		return channelsHistoryCmd.RunE(channelsHistoryCmd, []string{"C123"})
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedLimit != 100 {
		t.Errorf("expected limit=100, got %d", capturedLimit)
	}
}

func TestChannelsHistory_ClientError(t *testing.T) {
	cleanup := setChannelsClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := channelsHistoryCmd.RunE(channelsHistoryCmd, []string{"C123"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestChannelsHistory_APIError(t *testing.T) {
	cleanup := setChannelsMockClient(&slackutil.MockSlackAPI{
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			return nil, fmt.Errorf("channel_not_found")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetChannelsHistoryFlags(t)()

	err := channelsHistoryCmd.RunE(channelsHistoryCmd, []string{"BAD"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to get history") {
		t.Errorf("expected 'failed to get history', got %v", err)
	}
}
