package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
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

		limit, _ := cmd.Flags().GetInt("limit")
		includeArchived, _ := cmd.Flags().GetBool("include-archived")

		params := &slack.GetConversationsParameters{
			Types:           []string{"public_channel", "private_channel"},
			Limit:           limit,
			ExcludeArchived: !includeArchived,
		}

		var allChannels []slack.Channel
		for {
			channels, nextCursor, err := client.Bot.GetConversations(params)
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

		resp, err := client.Bot.GetConversationHistory(params)
		if err != nil {
			return fmt.Errorf("failed to get history: %w", err)
		}

		if outputJSON {
			type msgOut struct {
				Ts        string `json:"ts"`
				User      string `json:"user"`
				Text      string `json:"text"`
				ThreadTs  string `json:"thread_ts,omitempty"`
				ReplyCount int   `json:"reply_count,omitempty"`
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

	channelsHistoryCmd.Flags().Int("limit", 20, "Maximum number of messages to return")

	channelsCmd.AddCommand(channelsListCmd)
	channelsCmd.AddCommand(channelsHistoryCmd)
	rootCmd.AddCommand(channelsCmd)
}
