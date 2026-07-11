package slack

import (
	"os"

	slackapi "github.com/slack-go/slack"
)

// Client wraps the Slack API client using a User Token.
type Client struct {
	User SlackAPI
}

// NewClient creates a new Slack client from environment variables.
func NewClient() (*Client, error) {
	return newClientWithLookup(nil, os.LookupEnv, func(token string) SlackAPI {
		return slackapi.New(token)
	})
}

// NewClientForWorkspace creates a client for an explicitly selected alias.
func NewClientForWorkspace(alias string) (*Client, error) {
	return newClientWithLookup(&alias, os.LookupEnv, func(token string) SlackAPI {
		return slackapi.New(token)
	})
}

func newClientWithLookup(explicitAlias *string, lookupEnv LookupEnv, constructor func(string) SlackAPI) (*Client, error) {
	credentials, err := ResolveWorkspace(explicitAlias, lookupEnv)
	if err != nil {
		return nil, err
	}

	return &Client{User: constructor(credentials.token)}, nil
}

// TeamID returns the configured team ID.
func TeamID() string {
	return os.Getenv("SLACK_TEAM_ID")
}
