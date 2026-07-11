package cmd

import (
	"strings"
	"testing"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

func TestRootWorkspaceFlagIsPersistent(t *testing.T) {
	flag := rootCmd.PersistentFlags().Lookup("workspace")
	if flag == nil {
		t.Fatal("root persistent flag --workspace is not registered")
	}
}

func TestAllCLIClientFactoriesUseExplicitWorkspaceResolver(t *testing.T) {
	flag := rootCmd.PersistentFlags().Lookup("workspace")
	originalChanged := flag.Changed
	originalWorkspace := workspace
	t.Cleanup(func() {
		flag.Changed = originalChanged
		workspace = originalWorkspace
	})
	if err := rootCmd.PersistentFlags().Set("workspace", "operations"); err != nil {
		t.Fatalf("set workspace flag: %v", err)
	}
	t.Setenv("SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN", "")
	canary := "xoxp-legacy-secret-canary"
	t.Setenv("SLACK_USER_TOKEN", canary)

	factories := []struct {
		name string
		fn   func() (*slackutil.Client, error)
	}{
		{name: "auth", fn: authClientFunc},
		{name: "channels", fn: channelsClientFunc},
		{name: "messages", fn: messagesClientFunc},
		{name: "reactions", fn: reactionsClientFunc},
		{name: "search", fn: searchClientFunc},
		{name: "threads", fn: threadsClientFunc},
		{name: "users", fn: usersClientFunc},
	}

	for _, factory := range factories {
		t.Run(factory.name, func(t *testing.T) {
			client, err := factory.fn()
			if client != nil || err == nil || !strings.Contains(err.Error(), "SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN") {
				t.Fatalf("factory() client/error = %v/%v, want missing explicit token error", client, err)
			}
			if strings.Contains(err.Error(), canary) {
				t.Fatalf("factory() error leaked token: %v", err)
			}
		})
	}
}

func TestCommonClientFactoryRejectsExplicitEmptyWorkspace(t *testing.T) {
	flag := rootCmd.PersistentFlags().Lookup("workspace")
	originalChanged := flag.Changed
	originalWorkspace := workspace
	t.Cleanup(func() {
		flag.Changed = originalChanged
		workspace = originalWorkspace
	})
	if err := rootCmd.PersistentFlags().Set("workspace", ""); err != nil {
		t.Fatalf("set workspace flag: %v", err)
	}
	t.Setenv("SLACK_USER_TOKEN", "xoxp-legacy-secret-canary")

	_, err := newCommandClient()
	if err == nil || !strings.Contains(err.Error(), "invalid workspace alias") {
		t.Fatalf("newCommandClient() error = %v, want invalid alias", err)
	}
}
