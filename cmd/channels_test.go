package cmd

import (
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

// ---------- formatTimestamp ----------

func TestFormatTimestamp_ValidUnixTimestamp(t *testing.T) {
	// Arrange
	ts := "1675382400"
	var sec int64 = 1675382400
	want := time.Unix(sec, 0).Format("2006-01-02 15:04")

	// Act
	got := formatTimestamp(ts)

	// Assert
	if got != want {
		t.Errorf("formatTimestamp(%q) = %q, want %q", ts, got, want)
	}
}

func TestFormatTimestamp_WithMicroseconds(t *testing.T) {
	// Arrange: Sscanf with %d reads only the integer part before the dot
	ts := "1675382400.123456"
	var sec int64 = 1675382400
	want := time.Unix(sec, 0).Format("2006-01-02 15:04")

	// Act
	got := formatTimestamp(ts)

	// Assert
	if got != want {
		t.Errorf("formatTimestamp(%q) = %q, want %q", ts, got, want)
	}
}

func TestFormatTimestamp_InvalidString(t *testing.T) {
	// Arrange
	ts := "invalid"

	// Act
	got := formatTimestamp(ts)

	// Assert: sec=0, so the original string is returned
	if got != ts {
		t.Errorf("formatTimestamp(%q) = %q, want %q", ts, got, ts)
	}
}

func TestFormatTimestamp_EmptyString(t *testing.T) {
	// Arrange
	ts := ""

	// Act
	got := formatTimestamp(ts)

	// Assert
	if got != ts {
		t.Errorf("formatTimestamp(%q) = %q, want %q", ts, got, ts)
	}
}

func TestFormatTimestamp_Zero(t *testing.T) {
	// Arrange: sec=0 → returns original string
	ts := "0"

	// Act
	got := formatTimestamp(ts)

	// Assert
	if got != ts {
		t.Errorf("formatTimestamp(%q) = %q, want %q", ts, got, ts)
	}
}

// ---------- detectUnreadChannels ----------

func TestDetectUnreadChannels_HasUnread(t *testing.T) {
	// Arrange
	mock := &slackutil.MockSlackAPI{
		GetConversationInfoFunc: func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
			return &slackapi.Channel{
				GroupConversation: slackapi.GroupConversation{
					Name: "general",
					Conversation: slackapi.Conversation{
						ID:       input.ChannelID,
						LastRead: "1675382300.000000",
					},
				},
				IsMember: true,
			}, nil
		},
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			if params.Oldest != "" {
				// Count request: return 3 messages
				return &slackapi.GetConversationHistoryResponse{
					Messages: []slackapi.Message{
						{Msg: slackapi.Msg{Timestamp: "1675382400.000000"}},
						{Msg: slackapi.Msg{Timestamp: "1675382500.000000"}},
						{Msg: slackapi.Msg{Timestamp: "1675382600.000000"}},
					},
				}, nil
			}
			// Latest message request
			return &slackapi.GetConversationHistoryResponse{
				Messages: []slackapi.Message{
					{Msg: slackapi.Msg{Timestamp: "1675382400.000000"}},
				},
			}, nil
		},
	}
	client := &slackutil.Client{User: mock}
	channels := []slackapi.Channel{
		{GroupConversation: slackapi.GroupConversation{
			Name:         "general",
			Conversation: slackapi.Conversation{ID: "C001"},
		}},
	}

	// Act
	result := detectUnreadChannels(client, channels)

	// Assert
	if len(result) != 1 {
		t.Fatalf("expected 1 unread channel, got %d", len(result))
	}
	if !result[0].HasUnread {
		t.Error("expected HasUnread=true")
	}
	if result[0].UnreadMsgs != 3 {
		t.Errorf("expected UnreadMsgs=3, got %d", result[0].UnreadMsgs)
	}
}

func TestDetectUnreadChannels_NoUnread(t *testing.T) {
	// Arrange: lastRead >= latestTs → no unread
	mock := &slackutil.MockSlackAPI{
		GetConversationInfoFunc: func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
			return &slackapi.Channel{
				GroupConversation: slackapi.GroupConversation{
					Conversation: slackapi.Conversation{
						ID:       input.ChannelID,
						LastRead: "1675382400.000000",
					},
				},
				IsMember: true,
			}, nil
		},
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			return &slackapi.GetConversationHistoryResponse{
				Messages: []slackapi.Message{
					{Msg: slackapi.Msg{Timestamp: "1675382400.000000"}},
				},
			}, nil
		},
	}
	client := &slackutil.Client{User: mock}
	channels := []slackapi.Channel{
		{GroupConversation: slackapi.GroupConversation{
			Conversation: slackapi.Conversation{ID: "C001"},
		}},
	}

	// Act
	result := detectUnreadChannels(client, channels)

	// Assert
	if len(result) != 0 {
		t.Errorf("expected 0 unread channels, got %d", len(result))
	}
}

func TestDetectUnreadChannels_EmptyHistory(t *testing.T) {
	// Arrange: no messages in history
	mock := &slackutil.MockSlackAPI{
		GetConversationInfoFunc: func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
			return &slackapi.Channel{
				GroupConversation: slackapi.GroupConversation{
					Conversation: slackapi.Conversation{
						ID:       input.ChannelID,
						LastRead: "1675382300.000000",
					},
				},
				IsMember: true,
			}, nil
		},
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			return &slackapi.GetConversationHistoryResponse{
				Messages: []slackapi.Message{},
			}, nil
		},
	}
	client := &slackutil.Client{User: mock}
	channels := []slackapi.Channel{
		{GroupConversation: slackapi.GroupConversation{
			Conversation: slackapi.Conversation{ID: "C001"},
		}},
	}

	// Act
	result := detectUnreadChannels(client, channels)

	// Assert
	if len(result) != 0 {
		t.Errorf("expected 0 unread channels, got %d", len(result))
	}
}

func TestDetectUnreadChannels_NotMember(t *testing.T) {
	// Arrange: IsMember=false → skipped
	mock := &slackutil.MockSlackAPI{
		GetConversationInfoFunc: func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
			return &slackapi.Channel{
				GroupConversation: slackapi.GroupConversation{
					Conversation: slackapi.Conversation{
						ID:       input.ChannelID,
						LastRead: "1675382300.000000",
					},
				},
				IsMember: false,
			}, nil
		},
	}
	client := &slackutil.Client{User: mock}
	channels := []slackapi.Channel{
		{GroupConversation: slackapi.GroupConversation{
			Conversation: slackapi.Conversation{ID: "C001"},
		}},
	}

	// Act
	result := detectUnreadChannels(client, channels)

	// Assert
	if len(result) != 0 {
		t.Errorf("expected 0 unread channels, got %d", len(result))
	}
}

func TestDetectUnreadChannels_ConversationInfoError(t *testing.T) {
	// Arrange: GetConversationInfo returns error → channel is skipped
	mock := &slackutil.MockSlackAPI{
		GetConversationInfoFunc: func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
			return nil, fmt.Errorf("api error")
		},
	}
	client := &slackutil.Client{User: mock}
	channels := []slackapi.Channel{
		{GroupConversation: slackapi.GroupConversation{
			Conversation: slackapi.Conversation{ID: "C001"},
		}},
	}

	// Act
	result := detectUnreadChannels(client, channels)

	// Assert
	if len(result) != 0 {
		t.Errorf("expected 0 unread channels, got %d", len(result))
	}
}

func TestDetectUnreadChannels_HistoryError(t *testing.T) {
	// Arrange: GetConversationHistory returns error → channel is skipped
	mock := &slackutil.MockSlackAPI{
		GetConversationInfoFunc: func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
			return &slackapi.Channel{
				GroupConversation: slackapi.GroupConversation{
					Conversation: slackapi.Conversation{
						ID:       input.ChannelID,
						LastRead: "1675382300.000000",
					},
				},
				IsMember: true,
			}, nil
		},
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			return nil, fmt.Errorf("history api error")
		},
	}
	client := &slackutil.Client{User: mock}
	channels := []slackapi.Channel{
		{GroupConversation: slackapi.GroupConversation{
			Conversation: slackapi.Conversation{ID: "C001"},
		}},
	}

	// Act
	result := detectUnreadChannels(client, channels)

	// Assert
	if len(result) != 0 {
		t.Errorf("expected 0 unread channels, got %d", len(result))
	}
}

func TestDetectUnreadChannels_ConcurrencyNoRace(t *testing.T) {
	// Arrange: 100 channels, all with unread, verify no data race (go test -race)
	var callCount atomic.Int64
	mock := &slackutil.MockSlackAPI{
		GetConversationInfoFunc: func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
			callCount.Add(1)
			return &slackapi.Channel{
				GroupConversation: slackapi.GroupConversation{
					Name: "ch-" + input.ChannelID,
					Conversation: slackapi.Conversation{
						ID:       input.ChannelID,
						LastRead: "1675382300.000000",
					},
				},
				IsMember: true,
			}, nil
		},
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			if params.Oldest != "" {
				return &slackapi.GetConversationHistoryResponse{
					Messages: []slackapi.Message{
						{Msg: slackapi.Msg{Timestamp: "1675382400.000000"}},
					},
				}, nil
			}
			return &slackapi.GetConversationHistoryResponse{
				Messages: []slackapi.Message{
					{Msg: slackapi.Msg{Timestamp: "1675382400.000000"}},
				},
			}, nil
		},
	}
	client := &slackutil.Client{User: mock}

	channels := make([]slackapi.Channel, 100)
	for i := range channels {
		channels[i] = slackapi.Channel{
			GroupConversation: slackapi.GroupConversation{
				Conversation: slackapi.Conversation{ID: fmt.Sprintf("C%03d", i)},
			},
		}
	}

	// Act
	result := detectUnreadChannels(client, channels)

	// Assert
	if len(result) != 100 {
		t.Errorf("expected 100 unread channels, got %d", len(result))
	}
	if callCount.Load() != 100 {
		t.Errorf("expected 100 GetConversationInfo calls, got %d", callCount.Load())
	}
}

func TestDetectUnreadChannels_UnreadCountFetchError(t *testing.T) {
	// Arrange: unread exists, but count fetch fails → unreadCount=1
	callNum := 0
	mock := &slackutil.MockSlackAPI{
		GetConversationInfoFunc: func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
			return &slackapi.Channel{
				GroupConversation: slackapi.GroupConversation{
					Conversation: slackapi.Conversation{
						ID:       input.ChannelID,
						LastRead: "1675382300.000000",
					},
				},
				IsMember: true,
			}, nil
		},
		GetConversationHistoryFunc: func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
			callNum++
			if callNum == 1 {
				// First call: latest message
				return &slackapi.GetConversationHistoryResponse{
					Messages: []slackapi.Message{
						{Msg: slackapi.Msg{Timestamp: "1675382400.000000"}},
					},
				}, nil
			}
			// Second call: count request fails
			return nil, fmt.Errorf("count api error")
		},
	}
	client := &slackutil.Client{User: mock}
	channels := []slackapi.Channel{
		{GroupConversation: slackapi.GroupConversation{
			Conversation: slackapi.Conversation{ID: "C001"},
		}},
	}

	// Act
	result := detectUnreadChannels(client, channels)

	// Assert
	if len(result) != 1 {
		t.Fatalf("expected 1 unread channel, got %d", len(result))
	}
	if result[0].UnreadMsgs != 1 {
		t.Errorf("expected UnreadMsgs=1 (fallback), got %d", result[0].UnreadMsgs)
	}
}
