package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	slackutil "github.com/tackeyy/slamy/internal/slack"

	"github.com/slack-go/slack"
	"github.com/spf13/cobra"
)

var messagesCmd = &cobra.Command{
	Use:   "messages",
	Short: "Message operations",
}

var messagesPostCmd = &cobra.Command{
	Use:   "post <channel_id>",
	Short: "Post a message to a channel",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		channelID := args[0]

		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		text, _ := cmd.Flags().GetString("text")
		if text == "" {
			return fmt.Errorf("--text is required")
		}

		opts := []slack.MsgOption{
			slack.MsgOptionText(text, false),
		}

		_, ts, err := client.User.PostMessage(channelID, opts...)
		if err != nil {
			return fmt.Errorf("failed to post message: %w", err)
		}

		if outputJSON {
			out := map[string]string{
				"channel": channelID,
				"ts":      ts,
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		}

		if outputPlain {
			fmt.Printf("%s\t%s\n", channelID, ts)
			return nil
		}

		fmt.Printf("Message posted to %s (ts: %s)\n", channelID, ts)
		return nil
	},
}

var messagesReplyCmd = &cobra.Command{
	Use:   "reply <channel_id> <thread_ts>",
	Short: "Reply to a thread",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		channelID := args[0]
		threadTs := args[1]

		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		text, _ := cmd.Flags().GetString("text")
		if text == "" {
			return fmt.Errorf("--text is required")
		}

		opts := []slack.MsgOption{
			slack.MsgOptionText(text, false),
			slack.MsgOptionTS(threadTs),
		}

		_, ts, err := client.User.PostMessage(channelID, opts...)
		if err != nil {
			return fmt.Errorf("failed to reply: %w", err)
		}

		if outputJSON {
			out := map[string]string{
				"channel":   channelID,
				"ts":        ts,
				"thread_ts": threadTs,
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		}

		if outputPlain {
			fmt.Printf("%s\t%s\t%s\n", channelID, ts, threadTs)
			return nil
		}

		fmt.Printf("Reply posted to %s thread %s (ts: %s)\n", channelID, threadTs, ts)
		return nil
	},
}

func init() {
	messagesPostCmd.Flags().String("text", "", "Message text")
	messagesReplyCmd.Flags().String("text", "", "Reply text")

	messagesCmd.AddCommand(messagesPostCmd)
	messagesCmd.AddCommand(messagesReplyCmd)
	rootCmd.AddCommand(messagesCmd)
}
