package slack

import (
	"fmt"
	"os"

	"github.com/slack-go/slack"
)

// Client wraps Slack API clients for both Bot and User tokens.
type Client struct {
	Bot  *slack.Client
	User *slack.Client // for search.messages (requires User Token)
}

// NewClient creates a new Slack client from environment variables.
func NewClient() (*Client, error) {
	botToken := os.Getenv("SLACK_BOT_TOKEN")
	if botToken == "" {
		return nil, fmt.Errorf("SLACK_BOT_TOKEN is not set")
	}

	c := &Client{
		Bot: slack.New(botToken),
	}

	userToken := os.Getenv("SLACK_USER_TOKEN")
	if userToken != "" {
		c.User = slack.New(userToken)
	}

	return c, nil
}

// TeamID returns the configured team ID.
func TeamID() string {
	return os.Getenv("SLACK_TEAM_ID")
}
