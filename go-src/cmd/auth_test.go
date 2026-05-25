package cmd

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"strings"
	"testing"

	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

// ---------- helpers ----------

// captureStdout は f の実行中の os.Stdout を捕捉して返す。
// パッケージ変数 outputJSON / outputPlain も触るため、テスト並列化禁止 (t.Parallel() 不可)。
func captureStdout(t *testing.T, f func() error) (string, error) {
	t.Helper()
	r, w, _ := os.Pipe()
	orig := os.Stdout
	os.Stdout = w
	defer func() { os.Stdout = orig }()

	err := f()
	w.Close()
	var buf bytes.Buffer
	_, _ = io.Copy(&buf, r)
	return buf.String(), err
}

func resetOutputFlags(t *testing.T) func() {
	t.Helper()
	origJSON, origPlain := outputJSON, outputPlain
	outputJSON, outputPlain = false, false
	return func() { outputJSON, outputPlain = origJSON, origPlain }
}

// setAuthMockClient は authClientFunc を mock-based client に置き換え、cleanup を返す。
func setAuthMockClient(mock *slackutil.MockSlackAPI) func() {
	orig := authClientFunc
	authClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: mock}, nil
	}
	return func() { authClientFunc = orig }
}

func setAuthClientError(errMsg string) func() {
	orig := authClientFunc
	authClientFunc = func() (*slackutil.Client, error) {
		return nil, fmt.Errorf("%s", errMsg)
	}
	return func() { authClientFunc = orig }
}

func successAuthResp() *slackapi.AuthTestResponse {
	return &slackapi.AuthTestResponse{
		UserID: "U001",
		User:   "alice",
		TeamID: "T001",
		Team:   "MyTeam",
		URL:    "https://myteam.slack.com/",
	}
}

// ---------- authTestCmd ----------

func TestAuthTest_HumanOutput(t *testing.T) {
	cleanup := setAuthMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return successAuthResp(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()

	out, err := captureStdout(t, func() error {
		return authTestCmd.RunE(authTestCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "Authenticated as: alice (U001)") {
		t.Errorf("expected 'Authenticated as: alice (U001)' in output, got %q", out)
	}
	if !strings.Contains(out, "Team: MyTeam (T001)") {
		t.Errorf("expected team line in output, got %q", out)
	}
	if !strings.Contains(out, "URL: https://myteam.slack.com/") {
		t.Errorf("expected URL line in output, got %q", out)
	}
}

func TestAuthTest_JSONOutput(t *testing.T) {
	cleanup := setAuthMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return successAuthResp(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	outputJSON = true

	out, err := captureStdout(t, func() error {
		return authTestCmd.RunE(authTestCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, want := range []string{`"user_id": "U001"`, `"user": "alice"`, `"team_id": "T001"`, `"team": "MyTeam"`} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in JSON output, got %q", want, out)
		}
	}
}

func TestAuthTest_PlainOutput(t *testing.T) {
	cleanup := setAuthMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return successAuthResp(), nil
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()
	outputPlain = true

	out, err := captureStdout(t, func() error {
		return authTestCmd.RunE(authTestCmd, nil)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := "U001\talice\tT001\tMyTeam\n"
	if out != expected {
		t.Errorf("expected plain output %q, got %q", expected, out)
	}
}

func TestAuthTest_ClientError(t *testing.T) {
	cleanup := setAuthClientError("missing SLACK_USER_TOKEN")
	defer cleanup()
	defer resetOutputFlags(t)()

	err := authTestCmd.RunE(authTestCmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "missing SLACK_USER_TOKEN") {
		t.Errorf("expected client error to be wrapped, got %v", err)
	}
}

func TestAuthTest_AuthTestAPIError(t *testing.T) {
	cleanup := setAuthMockClient(&slackutil.MockSlackAPI{
		AuthTestFunc: func() (*slackapi.AuthTestResponse, error) {
			return nil, fmt.Errorf("invalid_auth")
		},
	})
	defer cleanup()
	defer resetOutputFlags(t)()

	err := authTestCmd.RunE(authTestCmd, nil)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "auth test failed") {
		t.Errorf("expected 'auth test failed' in error, got %v", err)
	}
	if !strings.Contains(err.Error(), "invalid_auth") {
		t.Errorf("expected 'invalid_auth' wrapped in error, got %v", err)
	}
}
