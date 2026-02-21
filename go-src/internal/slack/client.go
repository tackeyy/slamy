package slack

import (
	"fmt"
	"os"

	slackapi "github.com/slack-go/slack"
)

// Client wraps the Slack API client using a User Token.
type Client struct {
	User SlackAPI
}

// NewClient creates a new Slack client from environment variables.
func NewClient() (*Client, error) {
	userToken := os.Getenv("SLACK_USER_TOKEN")
	if userToken == "" {
		return nil, fmt.Errorf("SLACK_USER_TOKEN is not set")
	}

	return &Client{
		User: slackapi.New(userToken),
	}, nil
}

// TeamID returns the configured team ID.
func TeamID() string {
	return os.Getenv("SLACK_TEAM_ID")
}
