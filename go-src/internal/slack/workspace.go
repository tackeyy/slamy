package slack

import (
	"fmt"
	"regexp"
	"strings"
)

var workspaceAliasPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// LookupEnv retrieves an environment value and reports whether it is set.
type LookupEnv func(string) (string, bool)

// WorkspaceCredentials identifies the selected alias. The token is deliberately
// private so credentials cannot be accidentally formatted or serialized.
type WorkspaceCredentials struct {
	Alias string
	token string
}

// String redacts the credential when formatted.
func (c WorkspaceCredentials) String() string {
	return fmt.Sprintf("WorkspaceCredentials{Alias:%q, token:[REDACTED]}", c.Alias)
}

// GoString redacts the credential for Go-syntax formatting as well.
func (c WorkspaceCredentials) GoString() string {
	return c.String()
}

// WorkspaceTokenEnvName returns the token environment variable for alias.
func WorkspaceTokenEnvName(alias string) (string, error) {
	if len(alias) < 1 || len(alias) > 63 || !workspaceAliasPattern.MatchString(alias) {
		return "", fmt.Errorf("invalid workspace alias %q", alias)
	}

	return "SLAMY_WORKSPACE_" + strings.ToUpper(strings.ReplaceAll(alias, "-", "_")) + "_USER_TOKEN", nil
}

// ResolveWorkspace selects workspace credentials using explicit, default, then
// legacy precedence. Once an alias is selected, resolution is fail-closed.
func ResolveWorkspace(explicitAlias *string, lookupEnv LookupEnv) (WorkspaceCredentials, error) {
	if explicitAlias != nil {
		return resolveWorkspaceAlias(*explicitAlias, lookupEnv)
	}

	if defaultAlias, ok := lookupEnv("SLAMY_DEFAULT_WORKSPACE"); ok {
		return resolveWorkspaceAlias(defaultAlias, lookupEnv)
	}

	if token, ok := lookupEnv("SLACK_USER_TOKEN"); ok && token != "" {
		return WorkspaceCredentials{token: token}, nil
	}

	return WorkspaceCredentials{}, fmt.Errorf("SLACK_USER_TOKEN is not set")
}

func resolveWorkspaceAlias(alias string, lookupEnv LookupEnv) (WorkspaceCredentials, error) {
	envName, err := WorkspaceTokenEnvName(alias)
	if err != nil {
		return WorkspaceCredentials{}, err
	}

	token, ok := lookupEnv(envName)
	if !ok || token == "" {
		return WorkspaceCredentials{}, fmt.Errorf("%s is not set", envName)
	}

	return WorkspaceCredentials{Alias: alias, token: token}, nil
}
