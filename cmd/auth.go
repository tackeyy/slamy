package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	slackutil "github.com/tackeyy/slamy/internal/slack"

	"github.com/spf13/cobra"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Authentication commands",
}

var authTestCmd = &cobra.Command{
	Use:   "test",
	Short: "Test authentication with Slack API",
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		resp, err := client.User.AuthTest()
		if err != nil {
			return fmt.Errorf("auth test failed: %w", err)
		}

		if outputJSON {
			out := map[string]string{
				"user_id": resp.UserID,
				"user":    resp.User,
				"team_id": resp.TeamID,
				"team":    resp.Team,
				"url":     resp.URL,
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		}

		if outputPlain {
			fmt.Printf("%s\t%s\t%s\t%s\n", resp.UserID, resp.User, resp.TeamID, resp.Team)
			return nil
		}

		fmt.Printf("Authenticated as: %s (%s)\n", resp.User, resp.UserID)
		fmt.Printf("Team: %s (%s)\n", resp.Team, resp.TeamID)
		fmt.Printf("URL: %s\n", resp.URL)

		return nil
	},
}

func init() {
	authCmd.AddCommand(authTestCmd)
	rootCmd.AddCommand(authCmd)
}
