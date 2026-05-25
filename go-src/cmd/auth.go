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

// authClientFunc は auth コマンドが使う Slack クライアントを返す。
// テストで差し替えるための DI ポイント (Issue #51 PR-1)。
var authClientFunc = func() (*slackutil.Client, error) {
	return slackutil.NewClient()
}

var authTestCmd = &cobra.Command{
	Use:   "test",
	Short: "Test authentication with Slack API",
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := authClientFunc()
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
