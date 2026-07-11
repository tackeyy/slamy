package slack

import (
	"strings"
	"testing"
)

func TestNewClientWithLookupCreatesClientOnlyAfterSuccessfulResolution(t *testing.T) {
	explicit := "operations"
	canary := "xoxp-secret-canary"
	tests := []struct {
		name          string
		explicitAlias *string
		env           map[string]string
		wantToken     string
		wantErr       string
		wantCalls     int
	}{
		{name: "explicit workspace", explicitAlias: &explicit, env: map[string]string{"SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN": "explicit-token"}, wantToken: "explicit-token", wantCalls: 1},
		{name: "default workspace", env: map[string]string{"SLAMY_DEFAULT_WORKSPACE": "primary", "SLAMY_WORKSPACE_PRIMARY_USER_TOKEN": "default-token"}, wantToken: "default-token", wantCalls: 1},
		{name: "legacy workspace", env: map[string]string{"SLACK_USER_TOKEN": "legacy-token"}, wantToken: "legacy-token", wantCalls: 1},
		{name: "resolver error prevents client creation", explicitAlias: &explicit, env: map[string]string{"SLACK_USER_TOKEN": canary}, wantErr: "SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN", wantCalls: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			capturedToken := ""
			lookup := func(key string) (string, bool) {
				value, ok := tt.env[key]
				return value, ok
			}
			constructor := func(token string) SlackAPI {
				calls++
				capturedToken = token
				return &MockSlackAPI{}
			}

			client, err := newClientWithLookup(tt.explicitAlias, lookup, constructor)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("newClientWithLookup() error = %v, want containing %q", err, tt.wantErr)
				}
				if strings.Contains(err.Error(), canary) {
					t.Fatalf("newClientWithLookup() leaked token: %v", err)
				}
			} else if err != nil || client == nil {
				t.Fatalf("newClientWithLookup() client = %v, error = %v", client, err)
			}
			if calls != tt.wantCalls || capturedToken != tt.wantToken {
				t.Fatalf("constructor calls/token = %d/%q, want %d/%q", calls, capturedToken, tt.wantCalls, tt.wantToken)
			}
		})
	}
}

func TestNewClientForWorkspaceRejectsEmptyAlias(t *testing.T) {
	_, err := NewClientForWorkspace("")
	if err == nil || !strings.Contains(err.Error(), "invalid workspace alias") {
		t.Fatalf("NewClientForWorkspace() error = %v, want invalid alias", err)
	}
}
