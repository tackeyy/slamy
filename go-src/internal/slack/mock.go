package slack

import slackapi "github.com/slack-go/slack"

// MockSlackAPI is a test mock implementing SlackAPI.
type MockSlackAPI struct {
	AuthTestFunc                func() (*slackapi.AuthTestResponse, error)
	GetConversationsForUserFunc func(params *slackapi.GetConversationsForUserParameters) ([]slackapi.Channel, string, error)
	GetConversationsFunc        func(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error)
	GetConversationInfoFunc     func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error)
	GetConversationHistoryFunc  func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error)
	GetConversationRepliesFunc  func(params *slackapi.GetConversationRepliesParameters) ([]slackapi.Message, bool, string, error)
	PostMessageFunc             func(channelID string, options ...slackapi.MsgOption) (string, string, error)
	AddReactionFunc             func(name string, ref slackapi.ItemRef) error
	GetUsersFunc                func(options ...slackapi.GetUsersOption) ([]slackapi.User, error)
	GetUserInfoFunc             func(userID string) (*slackapi.User, error)
	SearchMessagesFunc          func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error)
}

func (m *MockSlackAPI) AuthTest() (*slackapi.AuthTestResponse, error) {
	if m.AuthTestFunc != nil {
		return m.AuthTestFunc()
	}
	panic("MockSlackAPI.AuthTestFunc not implemented")
}

func (m *MockSlackAPI) GetConversationsForUser(params *slackapi.GetConversationsForUserParameters) ([]slackapi.Channel, string, error) {
	if m.GetConversationsForUserFunc != nil {
		return m.GetConversationsForUserFunc(params)
	}
	panic("MockSlackAPI.GetConversationsForUserFunc not implemented")
}

func (m *MockSlackAPI) GetConversations(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error) {
	if m.GetConversationsFunc != nil {
		return m.GetConversationsFunc(params)
	}
	panic("MockSlackAPI.GetConversationsFunc not implemented")
}

func (m *MockSlackAPI) GetConversationInfo(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
	if m.GetConversationInfoFunc != nil {
		return m.GetConversationInfoFunc(input)
	}
	panic("MockSlackAPI.GetConversationInfoFunc not implemented")
}

func (m *MockSlackAPI) GetConversationHistory(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error) {
	if m.GetConversationHistoryFunc != nil {
		return m.GetConversationHistoryFunc(params)
	}
	panic("MockSlackAPI.GetConversationHistoryFunc not implemented")
}

func (m *MockSlackAPI) GetConversationReplies(params *slackapi.GetConversationRepliesParameters) ([]slackapi.Message, bool, string, error) {
	if m.GetConversationRepliesFunc != nil {
		return m.GetConversationRepliesFunc(params)
	}
	panic("MockSlackAPI.GetConversationRepliesFunc not implemented")
}

func (m *MockSlackAPI) PostMessage(channelID string, options ...slackapi.MsgOption) (string, string, error) {
	if m.PostMessageFunc != nil {
		return m.PostMessageFunc(channelID, options...)
	}
	panic("MockSlackAPI.PostMessageFunc not implemented")
}

func (m *MockSlackAPI) AddReaction(name string, ref slackapi.ItemRef) error {
	if m.AddReactionFunc != nil {
		return m.AddReactionFunc(name, ref)
	}
	panic("MockSlackAPI.AddReactionFunc not implemented")
}

func (m *MockSlackAPI) GetUsers(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
	if m.GetUsersFunc != nil {
		return m.GetUsersFunc(options...)
	}
	panic("MockSlackAPI.GetUsersFunc not implemented")
}

func (m *MockSlackAPI) GetUserInfo(userID string) (*slackapi.User, error) {
	if m.GetUserInfoFunc != nil {
		return m.GetUserInfoFunc(userID)
	}
	panic("MockSlackAPI.GetUserInfoFunc not implemented")
}

func (m *MockSlackAPI) SearchMessages(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
	if m.SearchMessagesFunc != nil {
		return m.SearchMessagesFunc(query, params)
	}
	panic("MockSlackAPI.SearchMessagesFunc not implemented")
}
