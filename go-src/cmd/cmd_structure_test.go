package cmd

import (
	"slices"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

// findSubcommand returns the subcommand of parent whose first word in Use matches name.
func findSubcommand(parent *cobra.Command, name string) *cobra.Command {
	for _, sub := range parent.Commands() {
		head := strings.Fields(sub.Use)
		if len(head) > 0 && head[0] == name {
			return sub
		}
	}
	return nil
}

// ---------- root ----------

func TestRootCmd_BasicStructure(t *testing.T) {
	if rootCmd.Use != "slamy" {
		t.Errorf("rootCmd.Use = %q, want %q", rootCmd.Use, "slamy")
	}
	if rootCmd.Short == "" {
		t.Error("rootCmd.Short must not be empty")
	}
	// persistent flags --json and --plain are registered in init()
	for _, flag := range []string{"json", "plain"} {
		if rootCmd.PersistentFlags().Lookup(flag) == nil {
			t.Errorf("rootCmd should have persistent flag --%s", flag)
		}
	}
}

func TestRootCmd_HasAllSubcommands(t *testing.T) {
	got := make([]string, 0, len(rootCmd.Commands()))
	for _, sub := range rootCmd.Commands() {
		head := strings.Fields(sub.Use)
		if len(head) > 0 {
			got = append(got, head[0])
		}
	}
	slices.Sort(got)
	want := []string{"auth", "channels", "messages", "reactions", "search", "threads", "users"}
	if !slices.Equal(got, want) {
		t.Errorf("rootCmd subcommands = %v, want exactly %v", got, want)
	}
}

// ---------- auth ----------

func TestAuthCmd_Structure(t *testing.T) {
	if authCmd.Use != "auth" {
		t.Errorf("authCmd.Use = %q", authCmd.Use)
	}
	test := findSubcommand(authCmd, "test")
	if test == nil {
		t.Fatal("auth has no 'test' subcommand")
	}
	if test.RunE == nil {
		t.Error("auth test must define RunE")
	}
}

// ---------- messages ----------

func TestMessagesCmd_Structure(t *testing.T) {
	post := findSubcommand(messagesCmd, "post")
	if post == nil {
		t.Fatal("messages has no 'post' subcommand")
	}
	if post.Flags().Lookup("text") == nil {
		t.Error("messages post must define --text flag")
	}
	reply := findSubcommand(messagesCmd, "reply")
	if reply == nil {
		t.Fatal("messages has no 'reply' subcommand")
	}
	for _, flag := range []string{"text", "broadcast"} {
		if reply.Flags().Lookup(flag) == nil {
			t.Errorf("messages reply must define --%s flag", flag)
		}
	}
	// reply requires 2 positional args
	if err := reply.Args(reply, []string{"only-one"}); err == nil {
		t.Error("messages reply must reject single arg")
	}
}

func TestMessagesPost_DefaultFlags(t *testing.T) {
	post := findSubcommand(messagesCmd, "post")
	if post == nil {
		t.Fatal("messages has no 'post' subcommand")
	}
	textFlag := post.Flags().Lookup("text")
	if textFlag == nil || textFlag.DefValue != "" {
		t.Errorf("messages post --text default should be empty, got %q", textFlag.DefValue)
	}
}

func TestMessagesReply_BroadcastDefault(t *testing.T) {
	reply := findSubcommand(messagesCmd, "reply")
	if reply == nil {
		t.Fatal("messages has no 'reply' subcommand")
	}
	broadcast := reply.Flags().Lookup("broadcast")
	if broadcast == nil || broadcast.DefValue != "false" {
		t.Errorf("messages reply --broadcast default should be false, got %q", broadcast.DefValue)
	}
}

// ---------- reactions ----------

func TestReactionsCmd_Structure(t *testing.T) {
	add := findSubcommand(reactionsCmd, "add")
	if add == nil {
		t.Fatal("reactions has no 'add' subcommand")
	}
	if add.Flags().Lookup("name") == nil {
		t.Error("reactions add must define --name flag")
	}
	// requires 2 args
	if err := add.Args(add, []string{"only-one"}); err == nil {
		t.Error("reactions add must reject single arg")
	}
}

// ---------- search ----------

func TestSearchCmd_DefaultFlags(t *testing.T) {
	msgs := findSubcommand(searchCmd, "messages")
	if msgs == nil {
		t.Fatal("search has no 'messages' subcommand")
	}
	tests := []struct {
		flag   string
		defVal string
	}{
		{"count", "20"},
		{"page", "1"},
		{"sort", "timestamp"},
		{"sort-dir", "desc"},
	}
	for _, tt := range tests {
		f := msgs.Flags().Lookup(tt.flag)
		if f == nil {
			t.Errorf("search messages must define --%s flag", tt.flag)
			continue
		}
		if f.DefValue != tt.defVal {
			t.Errorf("search messages --%s default = %q, want %q", tt.flag, f.DefValue, tt.defVal)
		}
	}
}

// ---------- threads ----------

func TestThreadsCmd_Structure(t *testing.T) {
	replies := findSubcommand(threadsCmd, "replies")
	if replies == nil {
		t.Fatal("threads has no 'replies' subcommand")
	}
	limit := replies.Flags().Lookup("limit")
	if limit == nil || limit.DefValue != "50" {
		t.Errorf("threads replies --limit default should be 50, got %q", limit.DefValue)
	}
	// requires 2 args
	if err := replies.Args(replies, []string{"only-one"}); err == nil {
		t.Error("threads replies must reject single arg")
	}
}

// ---------- users ----------

func TestUsersCmd_Structure(t *testing.T) {
	list := findSubcommand(usersCmd, "list")
	if list == nil {
		t.Fatal("users has no 'list' subcommand")
	}
	for _, flag := range []string{"include-deactivated", "include-bots"} {
		f := list.Flags().Lookup(flag)
		if f == nil {
			t.Errorf("users list must define --%s flag", flag)
		}
		if f != nil && f.DefValue != "false" {
			t.Errorf("users list --%s default should be false, got %q", flag, f.DefValue)
		}
	}
	profile := findSubcommand(usersCmd, "profile")
	if profile == nil {
		t.Fatal("users has no 'profile' subcommand")
	}
	// profile requires 1 arg
	if err := profile.Args(profile, []string{}); err == nil {
		t.Error("users profile must reject zero args")
	}
}

// ---------- channels ----------

func TestChannelsCmd_Structure(t *testing.T) {
	list := findSubcommand(channelsCmd, "list")
	if list == nil {
		t.Fatal("channels has no 'list' subcommand")
	}
	for _, flag := range []string{"limit", "include-archived", "unread"} {
		if list.Flags().Lookup(flag) == nil {
			t.Errorf("channels list must define --%s flag", flag)
		}
	}
	history := findSubcommand(channelsCmd, "history")
	if history == nil {
		t.Fatal("channels has no 'history' subcommand")
	}
	if history.Flags().Lookup("limit") == nil {
		t.Error("channels history must define --limit flag")
	}
}
