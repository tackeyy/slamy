package cmd

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"strings"
	"testing"

	"github.com/mark3labs/mcp-go/server"
	slackapi "github.com/slack-go/slack"

	slackutil "github.com/tackeyy/slamy/internal/slack"
)

func TestRunMCPServerResolvesClientOnceAndFixesItForToolCalls(t *testing.T) {
	originalGetClient := getClientFunc
	originalListen := listenMCPServerFunc
	t.Cleanup(func() {
		getClientFunc = originalGetClient
		listenMCPServerFunc = originalListen
	})

	resolverCalls := 0
	apiCalls := 0
	fixedClient := &slackutil.Client{User: &slackutil.MockSlackAPI{
		GetConversationsFunc: func(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error) {
			apiCalls++
			return []slackapi.Channel{}, "", nil
		},
	}}
	getClientFunc = func() (*slackutil.Client, error) {
		resolverCalls++
		return fixedClient, nil
	}
	listenMCPServerFunc = func(s *server.MCPServer) error {
		getClientFunc = func() (*slackutil.Client, error) {
			return nil, fmt.Errorf("startup resolver must not run during tool calls")
		}
		tool := s.GetTool("slack_list_channels")
		if tool == nil {
			t.Fatal("slack_list_channels tool is not registered")
		}
		for range 2 {
			result, err := tool.Handler(context.Background(), makeRequest(nil))
			if err != nil || result.IsError {
				t.Fatalf("tool handler error/result = %v/%v", err, result)
			}
		}
		return nil
	}

	if err := runMCPServer(); err != nil {
		t.Fatalf("runMCPServer() error = %v", err)
	}
	if resolverCalls != 1 || apiCalls != 2 {
		t.Fatalf("resolver/API calls = %d/%d, want 1/2", resolverCalls, apiCalls)
	}
}

func TestRunMCPServerDoesNotListenWhenResolutionFails(t *testing.T) {
	flag := rootCmd.PersistentFlags().Lookup("workspace")
	originalChanged := flag.Changed
	originalWorkspace := workspace
	originalGetClient := getClientFunc
	originalListen := listenMCPServerFunc
	t.Cleanup(func() {
		flag.Changed = originalChanged
		workspace = originalWorkspace
		getClientFunc = originalGetClient
		listenMCPServerFunc = originalListen
	})

	canary := "xoxp-secret-canary"
	if err := rootCmd.PersistentFlags().Set("workspace", "primary"); err != nil {
		t.Fatalf("set workspace flag: %v", err)
	}
	t.Setenv("SLAMY_WORKSPACE_PRIMARY_USER_TOKEN", "")
	t.Setenv("SLACK_USER_TOKEN", canary)
	getClientFunc = newCommandClient

	var loggerBuffer bytes.Buffer
	logger := log.New(&loggerBuffer, "[slamy-mcp] ", 0)
	listenCalls := 0
	listenMCPServerFunc = func(s *server.MCPServer) error {
		listenCalls++
		logger.Print(canary)
		return nil
	}

	err := runMCPServer()
	if err == nil || !strings.Contains(err.Error(), "SLAMY_WORKSPACE_PRIMARY_USER_TOKEN") {
		t.Fatalf("runMCPServer() error = %v, want resolver error", err)
	}
	if strings.Contains(err.Error(), canary) || strings.Contains(loggerBuffer.String(), canary) || listenCalls != 0 {
		t.Fatalf("runMCPServer() leaked token or started server: error=%v log=%q listenCalls=%d", err, loggerBuffer.String(), listenCalls)
	}
}

func TestRegisteredMCPToolsDoNotExposeWorkspaceArgument(t *testing.T) {
	s := server.NewMCPServer("slamy", "test")
	registerMCPTools(s, &slackutil.Client{User: &slackutil.MockSlackAPI{}})

	for name, tool := range s.ListTools() {
		if _, exists := tool.Tool.InputSchema.Properties["workspace"]; exists {
			t.Fatalf("tool %s exposes forbidden workspace argument", name)
		}
	}
}

func TestMCPResolverErrorResultDoesNotLeakLegacyToken(t *testing.T) {
	flag := rootCmd.PersistentFlags().Lookup("workspace")
	originalChanged := flag.Changed
	originalWorkspace := workspace
	originalGetClient := getClientFunc
	t.Cleanup(func() {
		flag.Changed = originalChanged
		workspace = originalWorkspace
		getClientFunc = originalGetClient
	})
	if err := rootCmd.PersistentFlags().Set("workspace", "operations"); err != nil {
		t.Fatalf("set workspace flag: %v", err)
	}
	t.Setenv("SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN", "")
	canary := "xoxp-legacy-secret-canary"
	t.Setenv("SLACK_USER_TOKEN", canary)
	getClientFunc = newCommandClient

	result, err := handleListChannels(context.Background(), makeRequest(nil))
	if err != nil {
		t.Fatalf("handleListChannels() error = %v", err)
	}
	if !result.IsError {
		t.Fatal("handleListChannels() result is not an error")
	}
	if text := resultText(t, result); strings.Contains(text, canary) {
		t.Fatalf("MCP error result leaked token: %s", text)
	}
}
