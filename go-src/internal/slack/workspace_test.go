package slack

import (
	"strings"
	"testing"
)

func TestWorkspaceTokenEnvNameConvertsHyphenatedAlias(t *testing.T) {
	got, err := WorkspaceTokenEnvName("project-a")
	if err != nil {
		t.Fatalf("WorkspaceTokenEnvName() error = %v", err)
	}
	if want := "SLAMY_WORKSPACE_PROJECT_A_USER_TOKEN"; got != want {
		t.Fatalf("WorkspaceTokenEnvName() = %q, want %q", got, want)
	}
}

func TestResolveWorkspaceSelectsCredentialsFailClosed(t *testing.T) {
	explicit := "operations"
	empty := ""
	legacyCanary := "xoxp-legacy-secret-canary"
	tests := []struct {
		name          string
		explicitAlias *string
		env           map[string]string
		wantAlias     string
		wantToken     string
		wantErr       string
	}{
		{name: "default alias", env: map[string]string{"SLAMY_DEFAULT_WORKSPACE": "primary", "SLAMY_WORKSPACE_PRIMARY_USER_TOKEN": "default-token"}, wantAlias: "primary", wantToken: "default-token"},
		{name: "explicit alias wins", explicitAlias: &explicit, env: map[string]string{"SLAMY_DEFAULT_WORKSPACE": "primary", "SLAMY_WORKSPACE_PRIMARY_USER_TOKEN": "default-token", "SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN": "explicit-token"}, wantAlias: "operations", wantToken: "explicit-token"},
		{name: "legacy fallback", env: map[string]string{"SLACK_USER_TOKEN": "legacy-token"}, wantToken: "legacy-token"},
		{name: "explicit token missing is fail closed", explicitAlias: &explicit, env: map[string]string{"SLACK_USER_TOKEN": legacyCanary}, wantErr: "SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN is not set"},
		{name: "default token missing is fail closed", env: map[string]string{"SLAMY_DEFAULT_WORKSPACE": "primary", "SLACK_USER_TOKEN": legacyCanary}, wantErr: "SLAMY_WORKSPACE_PRIMARY_USER_TOKEN is not set"},
		{name: "all credentials missing", env: map[string]string{}, wantErr: "SLACK_USER_TOKEN is not set"},
		{name: "explicit empty alias", explicitAlias: &empty, env: map[string]string{"SLACK_USER_TOKEN": legacyCanary}, wantErr: "invalid workspace alias"},
		{name: "configured empty default alias", env: map[string]string{"SLAMY_DEFAULT_WORKSPACE": "", "SLACK_USER_TOKEN": legacyCanary}, wantErr: "invalid workspace alias"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lookup := func(key string) (string, bool) {
				value, ok := tt.env[key]
				return value, ok
			}

			got, err := ResolveWorkspace(tt.explicitAlias, lookup)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("ResolveWorkspace() error = %v, want containing %q", err, tt.wantErr)
				}
				if strings.Contains(err.Error(), legacyCanary) {
					t.Fatalf("ResolveWorkspace() leaked token in error: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("ResolveWorkspace() error = %v", err)
			}
			if got.Alias != tt.wantAlias || got.token != tt.wantToken {
				t.Fatalf("ResolveWorkspace() = alias %q token %q, want alias %q token %q", got.Alias, got.token, tt.wantAlias, tt.wantToken)
			}
		})
	}
}

func TestWorkspaceTokenEnvNameValidatesAliasBoundaries(t *testing.T) {
	valid63 := strings.Repeat("a", 63)
	tests := []struct {
		alias   string
		wantErr bool
	}{
		{alias: "a"},
		{alias: valid63},
		{alias: strings.Repeat("a", 64), wantErr: true},
		{alias: "", wantErr: true},
		{alias: "Primary", wantErr: true},
		{alias: "project_a", wantErr: true},
		{alias: "運営", wantErr: true},
		{alias: "project a", wantErr: true},
		{alias: "project--a", wantErr: true},
		{alias: "-project", wantErr: true},
		{alias: "project-", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.alias, func(t *testing.T) {
			_, err := WorkspaceTokenEnvName(tt.alias)
			if (err != nil) != tt.wantErr {
				t.Fatalf("WorkspaceTokenEnvName(%q) error = %v, wantErr %v", tt.alias, err, tt.wantErr)
			}
		})
	}
}
