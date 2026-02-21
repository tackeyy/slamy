package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

// ---------- helper ----------

// makeRequest builds a CallToolRequest with the given arguments map.
func makeRequest(args map[string]any) mcp.CallToolRequest {
	return mcp.CallToolRequest{
		Params: mcp.CallToolParams{
			Arguments: args,
		},
	}
}

// resultText extracts the text from a CallToolResult's first TextContent.
func resultText(t *testing.T, result *mcp.CallToolResult) string {
	t.Helper()
	if len(result.Content) == 0 {
		t.Fatal("result has no content")
	}
	tc, ok := result.Content[0].(mcp.TextContent)
	if !ok {
		t.Fatalf("expected TextContent, got %T", result.Content[0])
	}
	return tc.Text
}

// isErrorResult checks whether the result is an error result.
func isErrorResult(result *mcp.CallToolResult) bool {
	return result.IsError
}

// setMockClient sets up the getClientFunc to return a mock-based client
// and returns a cleanup function.
func setMockClient(mock *slackutil.MockSlackAPI) func() {
	orig := getClientFunc
	getClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: mock}, nil
	}
	return func() { getClientFunc = orig }
}

// setClientError sets up the getClientFunc to return an error.
func setClientError(errMsg string) func() {
	orig := getClientFunc
	getClientFunc = func() (*slackutil.Client, error) {
		return nil, fmt.Errorf("%s", errMsg)
	}
	return func() { getClientFunc = orig }
}

// ---------- tsToTime ----------

func TestTsToTime_WithMicroseconds(t *testing.T) {
	ts := "1675382400.123456"
	var sec int64 = 1675382400
	want := time.Unix(sec, 0).Format("2006-01-02 15:04:05")

	got := tsToTime(ts)

	if got != want {
		t.Errorf("tsToTime(%q) = %q, want %q", ts, got, want)
	}
}

func TestTsToTime_WithoutDot(t *testing.T) {
	ts := "1675382400"
	var sec int64 = 1675382400
	want := time.Unix(sec, 0).Format("2006-01-02 15:04:05")

	got := tsToTime(ts)

	if got != want {
		t.Errorf("tsToTime(%q) = %q, want %q", ts, got, want)
	}
}

func TestTsToTime_InvalidString(t *testing.T) {
	ts := "invalid"

	got := tsToTime(ts)

	if got != ts {
		t.Errorf("tsToTime(%q) = %q, want %q", ts, got, ts)
	}
}

func TestTsToTime_EmptyString(t *testing.T) {
	ts := ""

	got := tsToTime(ts)

	if got != ts {
		t.Errorf("tsToTime(%q) = %q, want %q", ts, got, ts)
	}
}

func TestTsToTime_ZeroWithDecimal(t *testing.T) {
	ts := "0.000"

	got := tsToTime(ts)

	if got != ts {
		t.Errorf("tsToTime(%q) = %q, want %q", ts, got, ts)
	}
}

// ---------- jsonResult ----------

func TestJsonResult_MapSuccess(t *testing.T) {
	input := map[string]string{"key": "value"}

	result, err := jsonResult(input)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, `"key": "value"`) {
		t.Errorf("expected JSON containing key/value, got %q", text)
	}
}

func TestJsonResult_EmptySlice(t *testing.T) {
	input := []int{}

	result, err := jsonResult(input)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if text != "[]" {
		t.Errorf("expected %q, got %q", "[]", text)
	}
}

func TestJsonResult_Nil(t *testing.T) {
	result, err := jsonResult(nil)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if text != "null" {
		t.Errorf("expected %q, got %q", "null", text)
	}
}

func TestJsonResult_UnmarshalableValue(t *testing.T) {
	input := make(chan int)

	result, err := jsonResult(input)

	if err != nil {
		t.Fatalf("unexpected error (should be nil): %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for unmarshalable value")
	}
}

// ---------- handleListChannels ----------

func TestHandleListChannels_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetConversationsFunc: func(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error) {
			return []slackapi.Channel{
				{
					GroupConversation: slackapi.GroupConversation{
						Name:         "general",
						Conversation: slackapi.Conversation{ID: "C001"},
						Topic:        slackapi.Topic{Value: "General discussion"},
						Purpose:      slackapi.Purpose{Value: "General purpose"},
					},
					IsChannel: true,
				},
			}, "", nil
		},
	})
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleListChannels(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "general") {
		t.Errorf("expected result to contain 'general', got %q", text)
	}
	if !strings.Contains(text, "C001") {
		t.Errorf("expected result to contain 'C001', got %q", text)
	}
}

func TestHandleListChannels_WithLimit(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetConversationsFunc: func(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error) {
			channels := []slackapi.Channel{
				{GroupConversation: slackapi.GroupConversation{Name: "ch1", Conversation: slackapi.Conversation{ID: "C001"}}},
				{GroupConversation: slackapi.GroupConversation{Name: "ch2", Conversation: slackapi.Conversation{ID: "C002"}}},
				{GroupConversation: slackapi.GroupConversation{Name: "ch3", Conversation: slackapi.Conversation{ID: "C003"}}},
			}
			return channels, "", nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"limit": float64(2)})
	result, err := handleListChannels(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	var parsed []map[string]any
	if jsonErr := json.Unmarshal([]byte(text), &parsed); jsonErr != nil {
		t.Fatalf("failed to parse JSON: %v", jsonErr)
	}
	if len(parsed) != 2 {
		t.Errorf("expected 2 channels, got %d", len(parsed))
	}
}

func TestHandleListChannels_IncludeArchived(t *testing.T) {
	var capturedExcludeArchived bool
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetConversationsFunc: func(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error) {
			capturedExcludeArchived = params.ExcludeArchived
			return []slackapi.Channel{}, "", nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"include_archived": true})
	_, err := handleListChannels(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedExcludeArchived != false {
		t.Error("expected ExcludeArchived=false when include_archived=true")
	}
}

func TestHandleListChannels_APIError(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetConversationsFunc: func(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error) {
			return nil, "", fmt.Errorf("api failure")
		},
	})
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleListChannels(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for API failure")
	}
}

func TestHandleListChannels_ClientError(t *testing.T) {
	cleanup := setClientError("no token")
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleListChannels(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for client error")
	}
}

// ---------- handleGetChannelHistory ----------

func TestHandleGetChannelHistory_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			return &slackapi.GetConversationHistoryResponse{
				Messages: []slackapi.Message{
					{Msg: slackapi.Msg{Timestamp: "1675382400.000000", User: "U001", Text: "hello"}},
				},
			}, nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001"})
	result, err := handleGetChannelHistory(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "hello") {
		t.Errorf("expected 'hello' in result, got %q", text)
	}
	if !strings.Contains(text, "U001") {
		t.Errorf("expected 'U001' in result, got %q", text)
	}
}

func TestHandleGetChannelHistory_MissingChannelID(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleGetChannelHistory(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing channel_id")
	}
}

// ---------- handleGetThreadReplies ----------

func TestHandleGetThreadReplies_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetConversationRepliesFunc: func(params *slackapi.GetConversationRepliesParameters) ([]slackapi.Message, bool, string, error) {
			return []slackapi.Message{
				{Msg: slackapi.Msg{Timestamp: "1675382400.000000", User: "U001", Text: "parent"}},
				{Msg: slackapi.Msg{Timestamp: "1675382500.000000", User: "U002", Text: "reply"}},
			}, false, "", nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001", "thread_ts": "1675382400.000000"})
	result, err := handleGetThreadReplies(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "reply") {
		t.Errorf("expected 'reply' in result, got %q", text)
	}
}

func TestHandleGetThreadReplies_MissingChannelID(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"thread_ts": "1675382400.000000"})
	result, err := handleGetThreadReplies(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing channel_id")
	}
}

func TestHandleGetThreadReplies_MissingThreadTs(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001"})
	result, err := handleGetThreadReplies(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing thread_ts")
	}
}

// ---------- handlePostMessage ----------

func TestHandlePostMessage_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			return channelID, "1675382400.000000", nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001", "text": "hello world"})
	result, err := handlePostMessage(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "C001") {
		t.Errorf("expected 'C001' in result, got %q", text)
	}
}

func TestHandlePostMessage_MissingChannelID(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"text": "hello"})
	result, err := handlePostMessage(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing channel_id")
	}
}

func TestHandlePostMessage_MissingText(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001"})
	result, err := handlePostMessage(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing text")
	}
}

func TestHandlePostMessage_LongTextSplitsIntoThread(t *testing.T) {
	var calls []struct {
		channelID string
		hasTS     bool
	}
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			// Detect if MsgOptionTS is present by counting options
			hasTS := len(options) > 1
			calls = append(calls, struct {
				channelID string
				hasTS     bool
			}{channelID, hasTS})
			return channelID, "1675382400.000000", nil
		},
	})
	defer cleanup()

	longText := strings.Repeat("a", 2500) + "\n\n" + strings.Repeat("b", 2500)
	req := makeRequest(map[string]any{"channel_id": "C001", "text": longText})
	result, err := handlePostMessage(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if isErrorResult(result) {
		t.Fatal("unexpected error result")
	}
	if len(calls) != 2 {
		t.Fatalf("expected 2 PostMessage calls, got %d", len(calls))
	}
	if calls[0].hasTS {
		t.Error("first call should not have thread_ts")
	}
	if !calls[1].hasTS {
		t.Error("second call should have thread_ts (thread reply)")
	}
}

func TestHandlePostMessage_ShortTextNoSplit(t *testing.T) {
	callCount := 0
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			callCount++
			return channelID, "1675382400.000000", nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001", "text": "short message"})
	result, err := handlePostMessage(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if isErrorResult(result) {
		t.Fatal("unexpected error result")
	}
	if callCount != 1 {
		t.Fatalf("expected 1 PostMessage call, got %d", callCount)
	}
}

func TestHandlePostMessage_ThreadReplyError(t *testing.T) {
	callCount := 0
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			callCount++
			if callCount == 2 {
				return "", "", fmt.Errorf("thread reply failed")
			}
			return channelID, "1675382400.000000", nil
		},
	})
	defer cleanup()

	longText := strings.Repeat("a", 2500) + "\n\n" + strings.Repeat("b", 2500)
	req := makeRequest(map[string]any{"channel_id": "C001", "text": longText})
	result, err := handlePostMessage(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result when thread reply fails")
	}
}

// ---------- handleReplyToThread ----------

func TestHandleReplyToThread_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			return channelID, "1675382500.000000", nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{
		"channel_id": "C001",
		"thread_ts":  "1675382400.000000",
		"text":       "reply text",
	})
	result, err := handleReplyToThread(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "C001") {
		t.Errorf("expected 'C001' in result, got %q", text)
	}
	if !strings.Contains(text, "1675382400.000000") {
		t.Errorf("expected thread_ts in result, got %q", text)
	}
}

func TestHandleReplyToThread_MissingChannelID(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"thread_ts": "ts", "text": "hi"})
	result, err := handleReplyToThread(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing channel_id")
	}
}

func TestHandleReplyToThread_MissingThreadTs(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001", "text": "hi"})
	result, err := handleReplyToThread(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing thread_ts")
	}
}

func TestHandleReplyToThread_MissingText(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001", "thread_ts": "ts"})
	result, err := handleReplyToThread(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing text")
	}
}

// ---------- handleAddReaction ----------

func TestHandleAddReaction_Success(t *testing.T) {
	var capturedName string
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		AddReactionFunc: func(name string, ref slackapi.ItemRef) error {
			capturedName = name
			return nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{
		"channel_id": "C001",
		"timestamp":  "1675382400.000000",
		"reaction":   "thumbsup",
	})
	result, err := handleAddReaction(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "thumbsup") {
		t.Errorf("expected 'thumbsup' in result, got %q", text)
	}
	if capturedName != "thumbsup" {
		t.Errorf("expected AddReaction called with 'thumbsup', got %q", capturedName)
	}
}

func TestHandleAddReaction_MissingChannelID(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"timestamp": "ts", "reaction": "thumbsup"})
	result, err := handleAddReaction(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing channel_id")
	}
}

func TestHandleAddReaction_MissingTimestamp(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001", "reaction": "thumbsup"})
	result, err := handleAddReaction(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing timestamp")
	}
}

func TestHandleAddReaction_MissingReaction(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(map[string]any{"channel_id": "C001", "timestamp": "ts"})
	result, err := handleAddReaction(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing reaction")
	}
}

// ---------- handleGetUsers ----------

func TestHandleGetUsers_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetUsersFunc: func(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
			return []slackapi.User{
				{ID: "U001", Name: "alice", RealName: "Alice", Profile: slackapi.UserProfile{DisplayName: "alice"}},
				{ID: "U002", Name: "bob", RealName: "Bob", IsBot: true, Profile: slackapi.UserProfile{DisplayName: "bob-bot"}},
				{ID: "U003", Name: "charlie", RealName: "Charlie", Deleted: true, Profile: slackapi.UserProfile{DisplayName: "charlie"}},
			}, nil
		},
	})
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleGetUsers(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	// Default: bots are excluded, deleted users are excluded
	if !strings.Contains(text, "alice") {
		t.Error("expected 'alice' in result")
	}
	if strings.Contains(text, "bob-bot") {
		t.Error("expected bot user to be excluded")
	}
	if strings.Contains(text, "charlie") {
		t.Error("expected deleted user to be excluded")
	}
}

func TestHandleGetUsers_IncludeBots(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetUsersFunc: func(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
			return []slackapi.User{
				{ID: "U001", Name: "alice", RealName: "Alice", Profile: slackapi.UserProfile{DisplayName: "alice"}},
				{ID: "U002", Name: "bot", RealName: "Bot", IsBot: true, Profile: slackapi.UserProfile{DisplayName: "bot"}},
			}, nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"include_bots": true})
	result, err := handleGetUsers(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	var parsed []map[string]any
	if jsonErr := json.Unmarshal([]byte(text), &parsed); jsonErr != nil {
		t.Fatalf("failed to parse JSON: %v", jsonErr)
	}
	if len(parsed) != 2 {
		t.Errorf("expected 2 users (including bot), got %d", len(parsed))
	}
}

func TestHandleGetUsers_APIError(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetUsersFunc: func(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
			return nil, fmt.Errorf("users api error")
		},
	})
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleGetUsers(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for API failure")
	}
}

// ---------- handleGetUserProfile ----------

func TestHandleGetUserProfile_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetUserInfoFunc: func(userID string) (*slackapi.User, error) {
			return &slackapi.User{
				ID:       userID,
				Name:     "alice",
				RealName: "Alice Smith",
				TZ:       "America/New_York",
				IsAdmin:  true,
				Profile: slackapi.UserProfile{
					DisplayName: "alice",
					Email:       "alice@example.com",
					Title:       "Engineer",
					Phone:       "123-456-7890",
					StatusText:  "Working",
					StatusEmoji: ":computer:",
				},
			}, nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"user_id": "U001"})
	result, err := handleGetUserProfile(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "alice@example.com") {
		t.Errorf("expected email in result, got %q", text)
	}
	if !strings.Contains(text, "Alice Smith") {
		t.Errorf("expected real_name in result, got %q", text)
	}
}

func TestHandleGetUserProfile_MissingUserID(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleGetUserProfile(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing user_id")
	}
}

// ---------- handleSearchMessages ----------

func TestHandleSearchMessages_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
			return &slackapi.SearchMessages{
				Total: 1,
				Paging: slackapi.Paging{
					Page: 1,
				},
				Matches: []slackapi.SearchMessage{
					{
						Timestamp: "1675382400.000000",
						User:      "U001",
						Text:      "matching message",
						Permalink: "https://slack.com/archives/C001/p1675382400000000",
						Channel:   slackapi.CtxChannel{ID: "C001", Name: "general"},
					},
				},
			}, nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"query": "test query"})
	result, err := handleSearchMessages(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "matching message") {
		t.Errorf("expected 'matching message' in result, got %q", text)
	}
	if !strings.Contains(text, "general") {
		t.Errorf("expected 'general' in result, got %q", text)
	}
}

func TestHandleSearchMessages_MissingQuery(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleSearchMessages(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing query")
	}
}

func TestHandleSearchMessages_Pagination(t *testing.T) {
	var capturedParams slackapi.SearchParameters
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
			capturedParams = params
			return &slackapi.SearchMessages{
				Total:   0,
				Paging:  slackapi.Paging{Page: params.Page},
				Matches: []slackapi.SearchMessage{},
			}, nil
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{
		"query": "test",
		"count": float64(10),
		"page":  float64(3),
	})
	_, err := handleSearchMessages(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if capturedParams.Count != 10 {
		t.Errorf("expected count=10, got %d", capturedParams.Count)
	}
	if capturedParams.Page != 3 {
		t.Errorf("expected page=3, got %d", capturedParams.Page)
	}
}

func TestHandleSearchMessages_APIError(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
			return nil, fmt.Errorf("search api error")
		},
	})
	defer cleanup()

	req := makeRequest(map[string]any{"query": "test"})
	result, err := handleSearchMessages(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for API failure")
	}
}
