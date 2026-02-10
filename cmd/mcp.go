package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	slackapi "github.com/slack-go/slack"
	"github.com/spf13/cobra"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Start MCP server (stdio transport)",
	RunE: func(cmd *cobra.Command, args []string) error {
		return runMCPServer()
	},
}

func runMCPServer() error {
	mcpServer := server.NewMCPServer("slamy", "0.1.0",
		server.WithToolCapabilities(true),
		server.WithRecovery(),
	)

	registerMCPTools(mcpServer)

	stdioServer := server.NewStdioServer(mcpServer)
	stdioServer.SetErrorLogger(log.New(os.Stderr, "[slamy-mcp] ", log.LstdFlags))

	return stdioServer.Listen(context.Background(), os.Stdin, os.Stdout)
}

func registerMCPTools(s *server.MCPServer) {
	// slack_list_channels
	s.AddTool(
		mcp.NewTool("slack_list_channels",
			mcp.WithDescription("List Slack channels in the workspace"),
			mcp.WithNumber("limit", mcp.Description("Maximum number of channels (default 100)")),
			mcp.WithBoolean("include_archived", mcp.Description("Include archived channels")),
			mcp.WithReadOnlyHintAnnotation(true),
			mcp.WithDestructiveHintAnnotation(false),
		),
		handleListChannels,
	)

	// slack_get_channel_history
	s.AddTool(
		mcp.NewTool("slack_get_channel_history",
			mcp.WithDescription("Get message history from a Slack channel"),
			mcp.WithString("channel_id", mcp.Required(), mcp.Description("The channel ID")),
			mcp.WithNumber("limit", mcp.Description("Maximum number of messages (default 20)")),
			mcp.WithReadOnlyHintAnnotation(true),
			mcp.WithDestructiveHintAnnotation(false),
		),
		handleGetChannelHistory,
	)

	// slack_get_thread_replies
	s.AddTool(
		mcp.NewTool("slack_get_thread_replies",
			mcp.WithDescription("Get replies in a message thread"),
			mcp.WithString("channel_id", mcp.Required(), mcp.Description("The channel ID")),
			mcp.WithString("thread_ts", mcp.Required(), mcp.Description("Timestamp of the parent message")),
			mcp.WithNumber("limit", mcp.Description("Maximum number of replies (default 50)")),
			mcp.WithReadOnlyHintAnnotation(true),
			mcp.WithDestructiveHintAnnotation(false),
		),
		handleGetThreadReplies,
	)

	// slack_post_message
	s.AddTool(
		mcp.NewTool("slack_post_message",
			mcp.WithDescription("Post a message to a Slack channel"),
			mcp.WithString("channel_id", mcp.Required(), mcp.Description("The channel ID")),
			mcp.WithString("text", mcp.Required(), mcp.Description("Message text")),
			mcp.WithDestructiveHintAnnotation(false),
		),
		handlePostMessage,
	)

	// slack_reply_to_thread
	s.AddTool(
		mcp.NewTool("slack_reply_to_thread",
			mcp.WithDescription("Reply to a message thread"),
			mcp.WithString("channel_id", mcp.Required(), mcp.Description("The channel ID")),
			mcp.WithString("thread_ts", mcp.Required(), mcp.Description("Timestamp of the parent message")),
			mcp.WithString("text", mcp.Required(), mcp.Description("Reply text")),
			mcp.WithDestructiveHintAnnotation(false),
		),
		handleReplyToThread,
	)

	// slack_add_reaction
	s.AddTool(
		mcp.NewTool("slack_add_reaction",
			mcp.WithDescription("Add a reaction emoji to a message"),
			mcp.WithString("channel_id", mcp.Required(), mcp.Description("The channel ID")),
			mcp.WithString("timestamp", mcp.Required(), mcp.Description("Message timestamp")),
			mcp.WithString("reaction", mcp.Required(), mcp.Description("Emoji name without colons")),
			mcp.WithDestructiveHintAnnotation(false),
		),
		handleAddReaction,
	)

	// slack_get_users
	s.AddTool(
		mcp.NewTool("slack_get_users",
			mcp.WithDescription("List users in the Slack workspace"),
			mcp.WithBoolean("include_bots", mcp.Description("Include bot users")),
			mcp.WithReadOnlyHintAnnotation(true),
			mcp.WithDestructiveHintAnnotation(false),
		),
		handleGetUsers,
	)

	// slack_get_user_profile
	s.AddTool(
		mcp.NewTool("slack_get_user_profile",
			mcp.WithDescription("Get a user's profile information"),
			mcp.WithString("user_id", mcp.Required(), mcp.Description("The user ID")),
			mcp.WithReadOnlyHintAnnotation(true),
			mcp.WithDestructiveHintAnnotation(false),
		),
		handleGetUserProfile,
	)

	// slack_search_messages
	s.AddTool(
		mcp.NewTool("slack_search_messages",
			mcp.WithDescription("Search messages in Slack (requires User Token)"),
			mcp.WithString("query", mcp.Required(), mcp.Description("Search query. Supports Slack search modifiers like in:#channel, from:@user")),
			mcp.WithNumber("count", mcp.Description("Number of results per page (default 20)")),
			mcp.WithNumber("page", mcp.Description("Page number (default 1)")),
			mcp.WithReadOnlyHintAnnotation(true),
			mcp.WithDestructiveHintAnnotation(false),
		),
		handleSearchMessages,
	)
}

func getClient() (*slackutil.Client, error) {
	return slackutil.NewClient()
}

func handleListChannels(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := getClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	limit := request.GetInt("limit", 100)
	includeArchived := request.GetBool("include_archived", false)

	params := &slackapi.GetConversationsParameters{
		Types:           []string{"public_channel", "private_channel"},
		Limit:           limit,
		ExcludeArchived: !includeArchived,
	}

	var allChannels []slackapi.Channel
	for {
		channels, nextCursor, err := client.Bot.GetConversations(params)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("failed to list channels: %v", err)), nil
		}
		allChannels = append(allChannels, channels...)
		if nextCursor == "" || (limit > 0 && len(allChannels) >= limit) {
			break
		}
		params.Cursor = nextCursor
	}

	if limit > 0 && len(allChannels) > limit {
		allChannels = allChannels[:limit]
	}

	type channelOut struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Topic      string `json:"topic"`
		Purpose    string `json:"purpose"`
		NumMembers int    `json:"num_members"`
		IsPrivate  bool   `json:"is_private"`
		IsArchived bool   `json:"is_archived"`
	}
	out := make([]channelOut, len(allChannels))
	for i, ch := range allChannels {
		out[i] = channelOut{
			ID:         ch.ID,
			Name:       ch.Name,
			Topic:      ch.Topic.Value,
			Purpose:    ch.Purpose.Value,
			NumMembers: ch.NumMembers,
			IsPrivate:  ch.IsPrivate,
			IsArchived: ch.IsArchived,
		}
	}

	return jsonResult(out)
}

func handleGetChannelHistory(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := getClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	channelID, err := request.RequireString("channel_id")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	limit := request.GetInt("limit", 20)

	params := &slackapi.GetConversationHistoryParameters{
		ChannelID: channelID,
		Limit:     limit,
	}

	resp, err := client.Bot.GetConversationHistory(params)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to get history: %v", err)), nil
	}

	type msgOut struct {
		Ts         string `json:"ts"`
		User       string `json:"user"`
		Text       string `json:"text"`
		ThreadTs   string `json:"thread_ts,omitempty"`
		ReplyCount int    `json:"reply_count,omitempty"`
		Time       string `json:"time"`
	}
	out := make([]msgOut, len(resp.Messages))
	for i, msg := range resp.Messages {
		out[i] = msgOut{
			Ts:         msg.Timestamp,
			User:       msg.User,
			Text:       msg.Text,
			ThreadTs:   msg.ThreadTimestamp,
			ReplyCount: msg.ReplyCount,
			Time:       tsToTime(msg.Timestamp),
		}
	}

	return jsonResult(out)
}

func handleGetThreadReplies(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := getClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	channelID, err := request.RequireString("channel_id")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	threadTs, err := request.RequireString("thread_ts")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	limit := request.GetInt("limit", 50)

	params := &slackapi.GetConversationRepliesParameters{
		ChannelID: channelID,
		Timestamp: threadTs,
		Limit:     limit,
	}

	msgs, _, _, err := client.Bot.GetConversationReplies(params)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to get replies: %v", err)), nil
	}

	type msgOut struct {
		Ts   string `json:"ts"`
		User string `json:"user"`
		Text string `json:"text"`
		Time string `json:"time"`
	}
	out := make([]msgOut, len(msgs))
	for i, msg := range msgs {
		out[i] = msgOut{
			Ts:   msg.Timestamp,
			User: msg.User,
			Text: msg.Text,
			Time: tsToTime(msg.Timestamp),
		}
	}

	return jsonResult(out)
}

func handlePostMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := getClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	channelID, err := request.RequireString("channel_id")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	text, err := request.RequireString("text")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	_, ts, err := client.Bot.PostMessage(channelID,
		slackapi.MsgOptionText(text, false),
	)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to post message: %v", err)), nil
	}

	return jsonResult(map[string]string{"channel": channelID, "ts": ts})
}

func handleReplyToThread(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := getClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	channelID, err := request.RequireString("channel_id")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	threadTs, err := request.RequireString("thread_ts")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	text, err := request.RequireString("text")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	_, ts, err := client.Bot.PostMessage(channelID,
		slackapi.MsgOptionText(text, false),
		slackapi.MsgOptionTS(threadTs),
	)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to reply: %v", err)), nil
	}

	return jsonResult(map[string]string{"channel": channelID, "ts": ts, "thread_ts": threadTs})
}

func handleAddReaction(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := getClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	channelID, err := request.RequireString("channel_id")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	timestamp, err := request.RequireString("timestamp")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	reaction, err := request.RequireString("reaction")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	ref := slackapi.NewRefToMessage(channelID, timestamp)
	err = client.Bot.AddReaction(reaction, ref)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to add reaction: %v", err)), nil
	}

	return jsonResult(map[string]string{"channel": channelID, "ts": timestamp, "reaction": reaction})
}

func handleGetUsers(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := getClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	includeBots := request.GetBool("include_bots", false)

	users, err := client.Bot.GetUsers()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to list users: %v", err)), nil
	}

	type userOut struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		RealName    string `json:"real_name"`
		DisplayName string `json:"display_name"`
		IsBot       bool   `json:"is_bot"`
		Deleted     bool   `json:"deleted"`
	}

	var out []userOut
	for _, u := range users {
		if !includeBots && u.IsBot {
			continue
		}
		if u.Deleted {
			continue
		}
		out = append(out, userOut{
			ID:          u.ID,
			Name:        u.Name,
			RealName:    u.RealName,
			DisplayName: u.Profile.DisplayName,
			IsBot:       u.IsBot,
			Deleted:     u.Deleted,
		})
	}

	return jsonResult(out)
}

func handleGetUserProfile(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := getClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	userID, err := request.RequireString("user_id")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	user, err := client.Bot.GetUserInfo(userID)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("failed to get user profile: %v", err)), nil
	}

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
	}

	return jsonResult(out)
}

func handleSearchMessages(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	client, err := getClient()
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}

	if client.User == nil {
		return mcp.NewToolResultError("SLACK_USER_TOKEN is required for search"), nil
	}

	query, err := request.RequireString("query")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	count := request.GetInt("count", 20)
	page := request.GetInt("page", 1)

	params := slackapi.SearchParameters{
		Sort:          "timestamp",
		SortDirection: "desc",
		Count:         count,
		Page:          page,
	}

	result, err := client.User.SearchMessages(query, params)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("search failed: %v", err)), nil
	}

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

	return jsonResult(out)
}

func jsonResult(v interface{}) (*mcp.CallToolResult, error) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("JSON marshal error: %v", err)), nil
	}
	return mcp.NewToolResultText(string(b)), nil
}

func tsToTime(ts string) string {
	parts := strings.SplitN(ts, ".", 2)
	if len(parts) == 0 {
		return ts
	}
	var sec int64
	fmt.Sscanf(parts[0], "%d", &sec)
	if sec == 0 {
		return ts
	}
	return time.Unix(sec, 0).Format("2006-01-02 15:04:05")
}

func init() {
	rootCmd.AddCommand(mcpCmd)
}
