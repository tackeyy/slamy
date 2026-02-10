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

var searchCmd = &cobra.Command{
	Use:   "search",
	Short: "Search operations",
}

var searchMessagesCmd = &cobra.Command{
	Use:   "messages <query>",
	Short: "Search messages (requires User Token)",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		query := args[0]

		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		if client.User == nil {
			return fmt.Errorf("SLACK_USER_TOKEN is required for search")
		}

		count, _ := cmd.Flags().GetInt("count")
		page, _ := cmd.Flags().GetInt("page")
		sortBy, _ := cmd.Flags().GetString("sort")
		sortDir, _ := cmd.Flags().GetString("sort-dir")

		params := slack.SearchParameters{
			Sort:          sortBy,
			SortDirection: sortDir,
			Count:         count,
			Page:          page,
		}

		result, err := client.User.SearchMessages(query, params)
		if err != nil {
			return fmt.Errorf("search failed: %w", err)
		}

		if outputJSON {
			type matchOut struct {
				Ts        string `json:"ts"`
				Channel   string `json:"channel"`
				ChannelID string `json:"channel_id"`
				User      string `json:"user"`
				Text      string `json:"text"`
				Permalink string `json:"permalink"`
			}
			out := struct {
				Total   int        `json:"total"`
				Page    int        `json:"page"`
				Matches []matchOut `json:"matches"`
			}{
				Total: result.Total,
				Page:  result.Paging.Page,
			}
			for _, m := range result.Matches {
				out.Matches = append(out.Matches, matchOut{
					Ts:        m.Timestamp,
					Channel:   m.Channel.Name,
					ChannelID: m.Channel.ID,
					User:      m.User,
					Text:      m.Text,
					Permalink: m.Permalink,
				})
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		}

		if outputPlain {
			for _, m := range result.Matches {
				text := strings.ReplaceAll(m.Text, "\n", "\\n")
				fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\n",
					m.Timestamp, m.Channel.ID, m.Channel.Name, m.User, text, m.Permalink)
			}
			return nil
		}

		fmt.Printf("Found %d results (page %d)\n\n", result.Total, result.Paging.Page)
		for _, m := range result.Matches {
			ts := formatTimestamp(m.Timestamp)
			text := m.Text
			if len(text) > 200 {
				text = text[:200] + "..."
			}
			fmt.Printf("[%s] #%s %s:\n  %s\n  %s\n\n", ts, m.Channel.Name, m.User, text, m.Permalink)
		}
		return nil
	},
}

func init() {
	searchMessagesCmd.Flags().Int("count", 20, "Number of results per page")
	searchMessagesCmd.Flags().Int("page", 1, "Page number")
	searchMessagesCmd.Flags().String("sort", "timestamp", "Sort by (timestamp or score)")
	searchMessagesCmd.Flags().String("sort-dir", "desc", "Sort direction (asc or desc)")

	searchCmd.AddCommand(searchMessagesCmd)
	rootCmd.AddCommand(searchCmd)
}
