package slack

import slackapi "github.com/slack-go/slack"

// SlackAPI defines the Slack API operations used by slamy.
type SlackAPI interface {
	AuthTest() (*slackapi.AuthTestResponse, error)
	GetConversationsForUser(params *slackapi.GetConversationsForUserParameters) ([]slackapi.Channel, string, error)
	GetConversations(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error)
	GetConversationInfo(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error)
	GetConversationHistory(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error)
	GetConversationReplies(params *slackapi.GetConversationRepliesParameters) ([]slackapi.Message, bool, string, error)
	PostMessage(channelID string, options ...slackapi.MsgOption) (string, string, error)
	AddReaction(name string, ref slackapi.ItemRef) error
	GetUsers(options ...slackapi.GetUsersOption) ([]slackapi.User, error)
	GetUserInfo(userID string) (*slackapi.User, error)
	SearchMessages(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error)
}
