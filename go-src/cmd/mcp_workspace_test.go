package cmd

import (
	"context"
	"fmt"
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
	originalGetClient := getClientFunc
	originalListen := listenMCPServerFunc
	t.Cleanup(func() {
		getClientFunc = originalGetClient
		listenMCPServerFunc = originalListen
	})

	canary := "xoxp-secret-canary"
	getClientFunc = func() (*slackutil.Client, error) {
		return nil, fmt.Errorf("SLAMY_WORKSPACE_PRIMARY_USER_TOKEN is not set")
	}
	listenCalls := 0
	listenMCPServerFunc = func(s *server.MCPServer) error {
		listenCalls++
		return nil
	}

	err := runMCPServer()
	if err == nil || !strings.Contains(err.Error(), "SLAMY_WORKSPACE_PRIMARY_USER_TOKEN") {
		t.Fatalf("runMCPServer() error = %v, want resolver error", err)
	}
	if strings.Contains(err.Error(), canary) || listenCalls != 0 {
		t.Fatalf("runMCPServer() leaked token or started server: error=%v listenCalls=%d", err, listenCalls)
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
