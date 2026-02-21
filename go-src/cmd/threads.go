package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	slackutil "github.com/tackeyy/slamy/internal/slack"

	"github.com/slack-go/slack"
	"github.com/spf13/cobra"
)

var threadsCmd = &cobra.Command{
	Use:   "threads",
	Short: "Thread operations",
}

var threadsRepliesCmd = &cobra.Command{
	Use:   "replies <channel_id> <thread_ts>",
	Short: "Get thread replies",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		channelID := args[0]
		threadTs := args[1]

		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		limit, err := cmd.Flags().GetInt("limit")
		if err != nil {
			return fmt.Errorf("failed to get limit flag: %w", err)
		}

		params := &slack.GetConversationRepliesParameters{
			ChannelID: channelID,
			Timestamp: threadTs,
			Limit:     limit,
		}

		msgs, _, _, err := client.User.GetConversationReplies(params)
		if err != nil {
			return fmt.Errorf("failed to get replies: %w", err)
		}

		if outputJSON {
			type msgOut struct {
				Ts   string `json:"ts"`
				User string `json:"user"`
				Text string `json:"text"`
			}
			out := make([]msgOut, len(msgs))
			for i, msg := range msgs {
				out[i] = msgOut{
					Ts:   msg.Timestamp,
					User: msg.User,
					Text: msg.Text,
				}
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		}

		if outputPlain {
			for _, msg := range msgs {
				text := strings.ReplaceAll(msg.Text, "\n", "\\n")
				fmt.Printf("%s\t%s\t%s\n", msg.Timestamp, msg.User, text)
			}
			return nil
		}

		for _, msg := range msgs {
			ts := formatTimestamp(msg.Timestamp)
			fmt.Printf("[%s] %s: %s\n", ts, msg.User, msg.Text)
		}
		return nil
	},
}

func init() {
	threadsRepliesCmd.Flags().Int("limit", 50, "Maximum number of replies to return")

	threadsCmd.AddCommand(threadsRepliesCmd)
	rootCmd.AddCommand(threadsCmd)
}
