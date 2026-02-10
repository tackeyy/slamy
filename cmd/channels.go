package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	slackutil "github.com/tackeyy/slamy/internal/slack"

	"github.com/slack-go/slack"
	"github.com/spf13/cobra"
)

var channelsCmd = &cobra.Command{
	Use:   "channels",
	Short: "Channel operations",
}

var channelsListCmd = &cobra.Command{
	Use:   "list",
	Short: "List channels",
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		// Get authenticated user's ID to filter to member channels only
		authResp, err := client.User.AuthTest()
		if err != nil {
			return fmt.Errorf("failed to get auth info: %w", err)
		}

		limit, _ := cmd.Flags().GetInt("limit")
		includeArchived, _ := cmd.Flags().GetBool("include-archived")
		unreadOnly, _ := cmd.Flags().GetBool("unread")

		params := &slack.GetConversationsForUserParameters{
			UserID:          authResp.UserID,
			Types:           []string{"public_channel", "private_channel"},
			Limit:           limit,
			ExcludeArchived: !includeArchived,
		}

		var allChannels []slack.Channel
		for {
			channels, nextCursor, err := client.User.GetConversationsForUser(params)
			if err != nil {
				return fmt.Errorf("failed to list channels: %w", err)
			}
			allChannels = append(allChannels, channels...)
			if nextCursor == "" || (limit > 0 && len(allChannels) >= limit) {
				break
			}
			params.Cursor = nextCursor
		}

		if limit > 0 && len(allChannels) > limit {
			allChannels = allChannels[:limit]
		}

		// Detect unread channels using last_read vs latest message comparison
		if unreadOnly {
			unreadChannels := detectUnreadChannels(client, allChannels)

			if outputJSON {
				type channelOut struct {
					ID          string `json:"id"`
					Name        string `json:"name"`
					Topic       string `json:"topic"`
					Purpose     string `json:"purpose"`
					NumMembers  int    `json:"num_members"`
					IsPrivate   bool   `json:"is_private"`
					UnreadCount int    `json:"unread_count"`
				}
				out := make([]channelOut, len(unreadChannels))
				for i, ch := range unreadChannels {
					out[i] = channelOut{
						ID:          ch.ID,
						Name:        ch.Name,
						Topic:       ch.Topic.Value,
						Purpose:     ch.Purpose.Value,
						NumMembers:  ch.NumMembers,
						IsPrivate:   ch.IsPrivate,
						UnreadCount: ch.UnreadMsgs,
					}
				}
				enc := json.NewEncoder(os.Stdout)
				enc.SetIndent("", "  ")
				return enc.Encode(out)
			}

			if outputPlain {
				for _, ch := range unreadChannels {
					private := ""
					if ch.IsPrivate {
						private = "private"
					}
					fmt.Printf("%s\t%s\t%d\t%s\t%d\n", ch.ID, ch.Name, ch.NumMembers, private, ch.UnreadMsgs)
				}
				return nil
			}

			if len(unreadChannels) == 0 {
				fmt.Println("No unread channels")
				return nil
			}
			for _, ch := range unreadChannels {
				private := ""
				if ch.IsPrivate {
					private = " (private)"
				}
				fmt.Printf("#%-30s %s%s  [%d unread]\n", ch.Name, ch.ID, private, ch.UnreadMsgs)
			}
			return nil
		}

		if outputJSON {
			type channelOut struct {
				ID         string `json:"id"`
				Name       string `json:"name"`
				Topic      string `json:"topic"`
				Purpose    string `json:"purpose"`
				NumMembers int    `json:"num_members"`
				IsPrivate  bool   `json:"is_private"`
				IsArchived bool   `json:"is_archived"`
			}
			out := make([]channelOut, len(allChannels))
			for i, ch := range allChannels {
				out[i] = channelOut{
					ID:         ch.ID,
					Name:       ch.Name,
					Topic:      ch.Topic.Value,
					Purpose:    ch.Purpose.Value,
					NumMembers: ch.NumMembers,
					IsPrivate:  ch.IsPrivate,
					IsArchived: ch.IsArchived,
				}
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		}

		if outputPlain {
			for _, ch := range allChannels {
				private := ""
				if ch.IsPrivate {
					private = "private"
				}
				fmt.Printf("%s\t%s\t%d\t%s\t%s\n", ch.ID, ch.Name, ch.NumMembers, private, ch.Topic.Value)
			}
			return nil
		}

		for _, ch := range allChannels {
			private := ""
			if ch.IsPrivate {
				private = " (private)"
			}
			fmt.Printf("#%-30s %s%s  [%d members]\n", ch.Name, ch.ID, private, ch.NumMembers)
		}
		return nil
	},
}

// channelWithUnread holds a channel enriched with unread info.
type channelWithUnread struct {
	slack.Channel
	HasUnread  bool
	UnreadMsgs int
}

// detectUnreadChannels compares last_read (from conversations.info) with
// the latest message ts (from conversations.history) for each channel.
func detectUnreadChannels(client *slackutil.Client, channels []slack.Channel) []channelWithUnread {
	type result struct {
		index int
		ch    channelWithUnread
		err   error
	}

	results := make([]result, len(channels))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10) // concurrency limit

	for i, ch := range channels {
		wg.Add(1)
		go func(idx int, c slack.Channel) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			// Get last_read from conversations.info
			info, err := client.User.GetConversationInfo(&slack.GetConversationInfoInput{
				ChannelID: c.ID,
			})
			if err != nil {
				results[idx] = result{index: idx, ch: channelWithUnread{Channel: c}, err: err}
				return
			}

			// Skip channels where user is not a member
			if !info.IsMember {
				results[idx] = result{index: idx, ch: channelWithUnread{Channel: *info}, err: fmt.Errorf("not a member")}
				return
			}

			lastRead := info.LastRead

			// Get latest message from conversations.history
			histResp, err := client.User.GetConversationHistory(&slack.GetConversationHistoryParameters{
				ChannelID: c.ID,
				Limit:     1,
			})
			if err != nil {
				results[idx] = result{index: idx, ch: channelWithUnread{Channel: *info}, err: err}
				return
			}

			hasUnread := false
			unreadCount := 0
			if len(histResp.Messages) > 0 {
				latestTs := histResp.Messages[0].Timestamp
				if latestTs > lastRead {
					hasUnread = true
					// Count unread messages by fetching history after last_read
					countResp, err := client.User.GetConversationHistory(&slack.GetConversationHistoryParameters{
						ChannelID: c.ID,
						Oldest:    lastRead,
						Limit:     100,
					})
					if err == nil {
						unreadCount = len(countResp.Messages)
					} else {
						unreadCount = 1 // at least 1
					}
				}
			}

			results[idx] = result{
				index: idx,
				ch: channelWithUnread{
					Channel:    *info,
					HasUnread:  hasUnread,
					UnreadMsgs: unreadCount,
				},
			}
		}(i, ch)
	}
	wg.Wait()

	var out []channelWithUnread
	for _, r := range results {
		if r.err != nil {
			continue
		}
		if r.ch.HasUnread {
			out = append(out, r.ch)
		}
	}
	return out
}

var channelsHistoryCmd = &cobra.Command{
	Use:   "history <channel_id>",
	Short: "Get channel message history",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		channelID := args[0]

		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		limit, _ := cmd.Flags().GetInt("limit")

		params := &slack.GetConversationHistoryParameters{
			ChannelID: channelID,
			Limit:     limit,
		}

		resp, err := client.User.GetConversationHistory(params)
		if err != nil {
			return fmt.Errorf("failed to get history: %w", err)
		}

		if outputJSON {
			type msgOut struct {
				Ts         string `json:"ts"`
				User       string `json:"user"`
				Text       string `json:"text"`
				ThreadTs   string `json:"thread_ts,omitempty"`
				ReplyCount int    `json:"reply_count,omitempty"`
			}
			out := make([]msgOut, len(resp.Messages))
			for i, msg := range resp.Messages {
				out[i] = msgOut{
					Ts:         msg.Timestamp,
					User:       msg.User,
					Text:       msg.Text,
					ThreadTs:   msg.ThreadTimestamp,
					ReplyCount: msg.ReplyCount,
				}
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		}

		if outputPlain {
			for _, msg := range resp.Messages {
				text := strings.ReplaceAll(msg.Text, "\n", "\\n")
				fmt.Printf("%s\t%s\t%s\n", msg.Timestamp, msg.User, text)
			}
			return nil
		}

		for _, msg := range resp.Messages {
			ts := formatTimestamp(msg.Timestamp)
			thread := ""
			if msg.ReplyCount > 0 {
				thread = fmt.Sprintf(" [%d replies]", msg.ReplyCount)
			}
			fmt.Printf("[%s] %s: %s%s\n", ts, msg.User, msg.Text, thread)
		}
		return nil
	},
}

func formatTimestamp(ts string) string {
	var sec int64
	fmt.Sscanf(ts, "%d", &sec)
	if sec == 0 {
		return ts
	}
	t := time.Unix(sec, 0)
	return t.Format("2006-01-02 15:04")
}

func init() {
	channelsListCmd.Flags().Int("limit", 100, "Maximum number of channels to return")
	channelsListCmd.Flags().Bool("include-archived", false, "Include archived channels")
	channelsListCmd.Flags().Bool("unread", false, "Only show channels with unread messages")

	channelsHistoryCmd.Flags().Int("limit", 20, "Maximum number of messages to return")

	channelsCmd.AddCommand(channelsListCmd)
	channelsCmd.AddCommand(channelsHistoryCmd)
	rootCmd.AddCommand(channelsCmd)
}
