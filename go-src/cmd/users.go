package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	slackutil "github.com/tackeyy/slamy/internal/slack"

	"github.com/spf13/cobra"
)

var usersCmd = &cobra.Command{
	Use:   "users",
	Short: "User operations",
}

var usersListCmd = &cobra.Command{
	Use:   "list",
	Short: "List workspace users",
	RunE: func(cmd *cobra.Command, args []string) error {
		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		users, err := client.User.GetUsers()
		if err != nil {
			return fmt.Errorf("failed to list users: %w", err)
		}

		// Filter out bots and deactivated users by default
		includeDeactivated, err := cmd.Flags().GetBool("include-deactivated")
		if err != nil {
			return fmt.Errorf("failed to get include-deactivated flag: %w", err)
		}
		includeBots, err := cmd.Flags().GetBool("include-bots")
		if err != nil {
			return fmt.Errorf("failed to get include-bots flag: %w", err)
		}

		var filtered []struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			RealName    string `json:"real_name"`
			DisplayName string `json:"display_name"`
			Email       string `json:"email,omitempty"`
			IsBot       bool   `json:"is_bot"`
			Deleted     bool   `json:"deleted"`
		}

		for _, u := range users {
			if !includeBots && u.IsBot {
				continue
			}
			if !includeDeactivated && u.Deleted {
				continue
			}
			filtered = append(filtered, struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				RealName    string `json:"real_name"`
				DisplayName string `json:"display_name"`
				Email       string `json:"email,omitempty"`
				IsBot       bool   `json:"is_bot"`
				Deleted     bool   `json:"deleted"`
			}{
				ID:          u.ID,
				Name:        u.Name,
				RealName:    u.RealName,
				DisplayName: u.Profile.DisplayName,
				Email:       u.Profile.Email,
				IsBot:       u.IsBot,
				Deleted:     u.Deleted,
			})
		}

		if outputJSON {
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(filtered)
		}

		if outputPlain {
			for _, u := range filtered {
				fmt.Printf("%s\t%s\t%s\t%s\t%s\n", u.ID, u.Name, u.RealName, u.DisplayName, u.Email)
			}
			return nil
		}

		for _, u := range filtered {
			display := u.DisplayName
			if display == "" {
				display = u.RealName
			}
			fmt.Printf("%-12s @%-20s %s\n", u.ID, u.Name, display)
		}
		return nil
	},
}

var usersProfileCmd = &cobra.Command{
	Use:   "profile <user_id>",
	Short: "Get user profile",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		userID := args[0]

		client, err := slackutil.NewClient()
		if err != nil {
			return err
		}

		user, err := client.User.GetUserInfo(userID)
		if err != nil {
			return fmt.Errorf("failed to get user profile: %w", err)
		}

		if outputJSON {
			out := map[string]interface{}{
				"id":           user.ID,
				"name":         user.Name,
				"real_name":    user.RealName,
				"display_name": user.Profile.DisplayName,
				"email":        user.Profile.Email,
				"title":        user.Profile.Title,
				"phone":        user.Profile.Phone,
				"status_text":  user.Profile.StatusText,
				"status_emoji": user.Profile.StatusEmoji,
				"tz":           user.TZ,
				"is_admin":     user.IsAdmin,
				"is_bot":       user.IsBot,
				"deleted":      user.Deleted,
			}
			enc := json.NewEncoder(os.Stdout)
			enc.SetIndent("", "  ")
			return enc.Encode(out)
		}

		if outputPlain {
			fmt.Printf("%s\t%s\t%s\t%s\t%s\t%s\n",
				user.ID, user.Name, user.RealName, user.Profile.DisplayName, user.Profile.Email, user.Profile.Title)
			return nil
		}

		display := user.Profile.DisplayName
		if display == "" {
			display = user.RealName
		}
		fmt.Printf("User: %s (@%s)\n", display, user.Name)
		fmt.Printf("ID: %s\n", user.ID)
		if user.Profile.Title != "" {
			fmt.Printf("Title: %s\n", user.Profile.Title)
		}
		if user.Profile.Email != "" {
			fmt.Printf("Email: %s\n", user.Profile.Email)
		}
		if user.Profile.StatusText != "" {
			fmt.Printf("Status: %s %s\n", user.Profile.StatusEmoji, user.Profile.StatusText)
		}
		fmt.Printf("Timezone: %s\n", user.TZ)
		return nil
	},
}

func init() {
	usersListCmd.Flags().Bool("include-deactivated", false, "Include deactivated users")
	usersListCmd.Flags().Bool("include-bots", false, "Include bot users")

	usersCmd.AddCommand(usersListCmd)
	usersCmd.AddCommand(usersProfileCmd)
	rootCmd.AddCommand(usersCmd)
}
