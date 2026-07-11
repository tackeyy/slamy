package cmd

import (
	"bytes"
	"os"
	"os/exec"
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

func TestCLIResolverErrorDoesNotLeakLegacyTokenToOutput(t *testing.T) {
	flag := rootCmd.PersistentFlags().Lookup("workspace")
	originalChanged := flag.Changed
	originalWorkspace := workspace
	originalAuthClient := authClientFunc
	t.Cleanup(func() {
		flag.Changed = originalChanged
		workspace = originalWorkspace
		authClientFunc = originalAuthClient
	})
	if err := rootCmd.PersistentFlags().Set("workspace", "operations"); err != nil {
		t.Fatalf("set workspace flag: %v", err)
	}
	t.Setenv("SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN", "")
	canary := "xoxp-legacy-secret-canary"
	t.Setenv("SLACK_USER_TOKEN", canary)
	authClientFunc = newCommandClient

	stdout, err := captureStdout(t, func() error {
		return authTestCmd.RunE(authTestCmd, nil)
	})
	if err == nil {
		t.Fatal("auth test succeeded, want resolver error")
	}
	if strings.Contains(stdout, canary) || strings.Contains(err.Error(), canary) {
		t.Fatalf("CLI output leaked token: stdout=%q error=%v", stdout, err)
	}
}

func TestCLIResolverFailureStderrDoesNotLeakLegacyToken(t *testing.T) {
	canary := "xoxp-legacy-secret-canary"
	cmd := exec.Command(os.Args[0], "-test.run=^TestCLIResolverFailureHelperProcess$")
	cmd.Env = []string{
		"GO_WANT_CLI_RESOLVER_FAILURE_HELPER=1",
		"SLACK_USER_TOKEN=" + canary,
		"SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN=",
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err == nil {
		t.Fatal("CLI helper succeeded, want resolver failure")
	}
	if strings.Contains(stdout.String(), canary) || strings.Contains(stderr.String(), canary) {
		t.Fatalf("CLI output leaked token: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
	if !strings.Contains(stderr.String(), "SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN is not set") {
		t.Fatalf("CLI stderr = %q, want missing workspace token error", stderr.String())
	}
}

func TestCLIResolverFailureHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_CLI_RESOLVER_FAILURE_HELPER") != "1" {
		return
	}
	rootCmd.SetArgs([]string{"--workspace", "operations", "auth", "test"})
	Execute()
}
