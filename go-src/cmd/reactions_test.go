package cmd

import (
	"fmt"
	"strings"
	"testing"

	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

// setReactionsMockClient replaces reactionsClientFunc with a mock-based client.
func setReactionsMockClient(mock *slackutil.MockSlackAPI) func() {
	orig := reactionsClientFunc
	reactionsClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: mock}, nil
	}
	return func() { reactionsClientFunc = orig }
}

func setReactionsClientError(errMsg string) func() {
	orig := reactionsClientFunc
	reactionsClientFunc = func() (*slackutil.Client, error) {
		return nil, fmt.Errorf("%s", errMsg)
	}
	return func() { reactionsClientFunc = orig }
}

// resetReactionsFlags resets --name back to "" and restores on cleanup.
func resetReactionsFlags(t *testing.T) func() {
	t.Helper()
	if err := reactionsAddCmd.Flags().Set("name", ""); err != nil {
		t.Fatalf("failed to reset --name flag: %v", err)
	}
	return func() {
		_ = reactionsAddCmd.Flags().Set("name", "")
	}
}

// ---------- reactionsAddCmd ----------

func TestReactionsAdd_HumanOutput(t *testing.T) {
	var captured struct {
		name string
		ref  slackapi.ItemRef
	}
	cleanup := setReactionsMockClient(&slackutil.MockSlackAPI{
		AddReactionFunc: func(name string, ref slackapi.ItemRef) error {
			captured.name = name
			captured.ref = ref
			return nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetReactionsFlags(t)()

	if err := reactionsAddCmd.Flags().Set("name", "thumbsup"); err != nil {
		t.Fatalf("set --name: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return reactionsAddCmd.RunE(reactionsAddCmd, []string{"C123", "1700000000.000001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "Reaction :thumbsup: added to C123 at 1700000000.000001") {
		t.Errorf("expected reaction summary, got %q", out)
	}
	if captured.name != "thumbsup" {
		t.Errorf("AddReaction name = %q, want %q", captured.name, "thumbsup")
	}
	if captured.ref.Channel != "C123" || captured.ref.Timestamp != "1700000000.000001" {
		t.Errorf("AddReaction ref = %+v, want channel=C123 ts=1700000000.000001", captured.ref)
	}
}

func TestReactionsAdd_JSONOutput(t *testing.T) {
	cleanup := setReactionsMockClient(&slackutil.MockSlackAPI{
		AddReactionFunc: func(name string, ref slackapi.ItemRef) error { return nil },
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetReactionsFlags(t)()

	outputJSON = true
	if err := reactionsAddCmd.Flags().Set("name", "heart"); err != nil {
		t.Fatalf("set --name: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return reactionsAddCmd.RunE(reactionsAddCmd, []string{"C999", "1700000000.999999"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{`"channel": "C999"`, `"ts": "1700000000.999999"`, `"reaction": "heart"`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON output, got %q", want, out)
		}
	}
}

func TestReactionsAdd_PlainOutput(t *testing.T) {
	cleanup := setReactionsMockClient(&slackutil.MockSlackAPI{
		AddReactionFunc: func(name string, ref slackapi.ItemRef) error { return nil },
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetReactionsFlags(t)()

	outputPlain = true
	if err := reactionsAddCmd.Flags().Set("name", "eyes"); err != nil {
		t.Fatalf("set --name: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return reactionsAddCmd.RunE(reactionsAddCmd, []string{"C222", "1700000000.111111"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "C222\t1700000000.111111\teyes\n"
	if out != expected {
		t.Errorf("expected plain output %q, got %q", expected, out)
	}
}

func TestReactionsAdd_MissingName(t *testing.T) {
	cleanup := setReactionsMockClient(&slackutil.MockSlackAPI{
		AddReactionFunc: func(name string, ref slackapi.ItemRef) error { return nil },
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetReactionsFlags(t)()

	err := reactionsAddCmd.RunE(reactionsAddCmd, []string{"C123", "1700000000.000001"})
	if err == nil {
		t.Fatal("expected error when --name is empty")
	}
	if !strings.Contains(err.Error(), "--name is required") {
		t.Errorf("expected '--name is required' error, got %v", err)
	}
}

func TestReactionsAdd_ClientError(t *testing.T) {
	cleanup := setReactionsClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := reactionsAddCmd.RunE(reactionsAddCmd, []string{"C123", "1700000000.000001"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "missing SLACK_USER_TOKEN") {
		t.Errorf("expected client error wrapped, got %v", err)
	}
}

func TestReactionsAdd_APIError(t *testing.T) {
	cleanup := setReactionsMockClient(&slackutil.MockSlackAPI{
		AddReactionFunc: func(name string, ref slackapi.ItemRef) error {
			return fmt.Errorf("already_reacted")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetReactionsFlags(t)()

	if err := reactionsAddCmd.Flags().Set("name", "thumbsup"); err != nil {
		t.Fatalf("set --name: %v", err)
	}

	err := reactionsAddCmd.RunE(reactionsAddCmd, []string{"C123", "1700000000.000001"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to add reaction") {
		t.Errorf("expected 'failed to add reaction', got %v", err)
	}
	if !strings.Contains(err.Error(), "already_reacted") {
		t.Errorf("expected API error wrapped, got %v", err)
	}
}
