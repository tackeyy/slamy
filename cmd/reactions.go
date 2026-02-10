package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	slackutil "github.com/tackeyy/slamy/internal/slack"

	"github.com/slack-go/slack"
	"github.com/spf13/cobra"
)

var reactionsCmd = &cobra.Command{
	Use:   "reactions",
	Short: "Reaction operations",
}

var reactionsAddCmd = &cobra.Command{
	Use:   "add <channel_id> <timestamp>",
	Short: "Add a reaction to a message",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		channelID := args[0]
		timestamp := args[1]

		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		name, _ := cmd.Flags().GetString("name")
		if name == "" {
			return fmt.Errorf("--name is required")
		}

		ref := slack.NewRefToMessage(channelID, timestamp)
		err = client.Bot.AddReaction(name, ref)
		if err != nil {
			return fmt.Errorf("failed to add reaction: %w", err)
		}

		if outputJSON {
			out := map[string]string{
				"channel":  channelID,
				"ts":       timestamp,
				"reaction": name,
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		}

		if outputPlain {
			fmt.Printf("%s\t%s\t%s\n", channelID, timestamp, name)
			return nil
		}

		fmt.Printf("Reaction :%s: added to %s at %s\n", name, channelID, timestamp)
		return nil
	},
}

func init() {
	reactionsAddCmd.Flags().String("name", "", "Reaction emoji name (without colons)")

	reactionsCmd.AddCommand(reactionsAddCmd)
	rootCmd.AddCommand(reactionsCmd)
}
