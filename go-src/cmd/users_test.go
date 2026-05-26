package cmd

import (
	"fmt"
	"strings"
	"testing"

	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

func setUsersMockClient(mock *slackutil.MockSlackAPI) func() {
	orig := usersClientFunc
	usersClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: mock}, nil
	}
	return func() { usersClientFunc = orig }
}

func setUsersClientError(errMsg string) func() {
	orig := usersClientFunc
	usersClientFunc = func() (*slackutil.Client, error) {
		return nil, fmt.Errorf("%s", errMsg)
	}
	return func() { usersClientFunc = orig }
}

func resetUsersListFlags(t *testing.T) func() {
	t.Helper()
	for _, kv := range [][2]string{
		{"include-deactivated", "false"}, {"include-bots", "false"},
	} {
		if err := usersListCmd.Flags().Set(kv[0], kv[1]); err != nil {
			t.Fatalf("reset --%s: %v", kv[0], err)
		}
	}
	return func() {
		for _, kv := range [][2]string{
			{"include-deactivated", "false"}, {"include-bots", "false"},
		} {
			if err := usersListCmd.Flags().Set(kv[0], kv[1]); err != nil {
				t.Errorf("reset --%s: %v", kv[0], err)
			}
		}
	}
}

func sampleUsers() []slackapi.User {
	return []slackapi.User{
		{
			ID:       "U001",
			Name:     "alice",
			RealName: "Alice Allen",
			Profile:  slackapi.UserProfile{DisplayName: "Alice", Email: "alice@example.com"},
		},
		{
			ID:       "U002",
			Name:     "bob",
			RealName: "Bob Brown",
			Profile:  slackapi.UserProfile{DisplayName: "", Email: "bob@example.com"},
		},
		{
			ID:       "U_BOT",
			Name:     "slackbot",
			RealName: "Slackbot",
			IsBot:    true,
			Profile:  slackapi.UserProfile{DisplayName: "Slackbot"},
		},
		{
			ID:       "U_GONE",
			Name:     "departed",
			RealName: "Departed User",
			Deleted:  true,
			Profile:  slackapi.UserProfile{DisplayName: "Departed"},
		},
	}
}

// ---------- usersListCmd ----------

func TestUsersList_HumanDefault(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUsersFunc: func(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
			return sampleUsers(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetUsersListFlags(t)()

	out, err := captureStdout(t, func() error {
		return usersListCmd.RunE(usersListCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Default: exclude bots + deactivated → only U001, U002
	if !strings.Contains(out, "U001") || !strings.Contains(out, "@alice") {
		t.Errorf("expected alice line, got %q", out)
	}
	if !strings.Contains(out, "U002") || !strings.Contains(out, "@bob") {
		t.Errorf("expected bob line, got %q", out)
	}
	// Bob has empty display_name → falls back to real_name
	if !strings.Contains(out, "Bob Brown") {
		t.Errorf("expected real_name fallback for bob, got %q", out)
	}
	if strings.Contains(out, "U_BOT") {
		t.Errorf("expected bot user excluded, got %q", out)
	}
	if strings.Contains(out, "U_GONE") {
		t.Errorf("expected deactivated user excluded, got %q", out)
	}
}

func TestUsersList_IncludeBots(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUsersFunc: func(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
			return sampleUsers(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetUsersListFlags(t)()

	if err := usersListCmd.Flags().Set("include-bots", "true"); err != nil {
		t.Fatalf("set --include-bots: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return usersListCmd.RunE(usersListCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "U_BOT") {
		t.Errorf("expected bot user included, got %q", out)
	}
}

func TestUsersList_IncludeDeactivated(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUsersFunc: func(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
			return sampleUsers(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetUsersListFlags(t)()

	if err := usersListCmd.Flags().Set("include-deactivated", "true"); err != nil {
		t.Fatalf("set --include-deactivated: %v", err)
	}

	out, err := captureStdout(t, func() error {
		return usersListCmd.RunE(usersListCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "U_GONE") {
		t.Errorf("expected deactivated user included, got %q", out)
	}
}

func TestUsersList_JSONOutput(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUsersFunc: func(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
			return sampleUsers(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetUsersListFlags(t)()

	outputJSON = true

	out, err := captureStdout(t, func() error {
		return usersListCmd.RunE(usersListCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{`"id": "U001"`, `"name": "alice"`, `"real_name": "Alice Allen"`, `"email": "alice@example.com"`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON output, got %q", want, out)
		}
	}
}

func TestUsersList_PlainOutput(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUsersFunc: func(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
			return sampleUsers(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetUsersListFlags(t)()

	outputPlain = true

	out, err := captureStdout(t, func() error {
		return usersListCmd.RunE(usersListCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "U001\talice\tAlice Allen\tAlice\talice@example.com") {
		t.Errorf("expected alice plain line, got %q", out)
	}
}

func TestUsersList_ClientError(t *testing.T) {
	cleanup := setUsersClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := usersListCmd.RunE(usersListCmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "missing SLACK_USER_TOKEN") {
		t.Errorf("expected client error wrapped, got %v", err)
	}
}

func TestUsersList_APIError(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUsersFunc: func(options ...slackapi.GetUsersOption) ([]slackapi.User, error) {
			return nil, fmt.Errorf("ratelimited")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	defer resetUsersListFlags(t)()

	err := usersListCmd.RunE(usersListCmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to list users") {
		t.Errorf("expected 'failed to list users', got %v", err)
	}
}

// ---------- usersProfileCmd ----------

func sampleProfileUser() *slackapi.User {
	return &slackapi.User{
		ID:       "U001",
		Name:     "alice",
		RealName: "Alice Allen",
		TZ:       "Asia/Tokyo",
		IsAdmin:  true,
		Profile: slackapi.UserProfile{
			DisplayName: "Alice",
			Email:       "alice@example.com",
			Title:       "Engineer",
			Phone:       "+81-90-xxxx",
			StatusText:  "Coding",
			StatusEmoji: ":computer:",
		},
	}
}

func TestUsersProfile_HumanOutput(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUserInfoFunc: func(userID string) (*slackapi.User, error) {
			if userID != "U001" {
				t.Errorf("expected userID=U001, got %q", userID)
			}
			return sampleProfileUser(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()

	out, err := captureStdout(t, func() error {
		return usersProfileCmd.RunE(usersProfileCmd, []string{"U001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{"User: Alice (@alice)", "ID: U001", "Title: Engineer", "Email: alice@example.com", "Status: :computer: Coding", "Timezone: Asia/Tokyo"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in output, got %q", want, out)
		}
	}
}

func TestUsersProfile_JSONOutput(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUserInfoFunc: func(userID string) (*slackapi.User, error) {
			return sampleProfileUser(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()

	outputJSON = true

	out, err := captureStdout(t, func() error {
		return usersProfileCmd.RunE(usersProfileCmd, []string{"U001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{`"id": "U001"`, `"display_name": "Alice"`, `"tz": "Asia/Tokyo"`, `"is_admin": true`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON output, got %q", want, out)
		}
	}
}

func TestUsersProfile_PlainOutput(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUserInfoFunc: func(userID string) (*slackapi.User, error) {
			return sampleProfileUser(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()

	outputPlain = true

	out, err := captureStdout(t, func() error {
		return usersProfileCmd.RunE(usersProfileCmd, []string{"U001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "U001\talice\tAlice Allen\tAlice\talice@example.com\tEngineer\n"
	if out != expected {
		t.Errorf("expected plain output %q, got %q", expected, out)
	}
}

func TestUsersProfile_DisplayNameFallback(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUserInfoFunc: func(userID string) (*slackapi.User, error) {
			u := sampleProfileUser()
			u.Profile.DisplayName = "" // force fallback to real_name
			return u, nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()

	out, err := captureStdout(t, func() error {
		return usersProfileCmd.RunE(usersProfileCmd, []string{"U001"})
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "User: Alice Allen") {
		t.Errorf("expected real_name fallback when display_name empty, got %q", out)
	}
}

func TestUsersProfile_ClientError(t *testing.T) {
	cleanup := setUsersClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := usersProfileCmd.RunE(usersProfileCmd, []string{"U001"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestUsersProfile_APIError(t *testing.T) {
	cleanup := setUsersMockClient(&slackutil.MockSlackAPI{
		GetUserInfoFunc: func(userID string) (*slackapi.User, error) {
			return nil, fmt.Errorf("user_not_found")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()

	err := usersProfileCmd.RunE(usersProfileCmd, []string{"BAD"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "failed to get user profile") {
		t.Errorf("expected 'failed to get user profile', got %v", err)
	}
}
