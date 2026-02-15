# Testing Guide

## Overview

Slamy uses Go's standard `testing` package. All code contributions must include comprehensive tests. The project currently has **52 tests** covering channel operations, MCP handlers, and utility functions.

## Test Philosophy

- **Write tests first** when fixing bugs (TDD approach)
- **Cover all new code** with appropriate tests
- **No breaking changes** without tests proving backward compatibility
- **Fast execution** - unit tests should run in milliseconds
- **Race-free** - all tests must pass with `-race` flag

## Test Structure

### Directory Layout

```
cmd/
  channels_test.go       # Channel operation tests (formatTimestamp, detectUnreadChannels)
  mcp_test.go            # MCP handler tests (tsToTime, jsonResult, all 9 handler functions)
internal/
  slack/
    interface.go         # SlackAPI interface definition
    mock.go              # MockSlackAPI mock implementation
```

### Naming Conventions

- Test files: `*_test.go`
- Test functions: `TestFunctionName_Scenario` (e.g., `TestFormatTimestamp_WithMicroseconds`)
- Helper functions: unexported, placed at the top of the test file (e.g., `makeRequest`, `resultText`)

## Test Categories

### 1. Unit Tests

Test pure functions in isolation, without any Slack API interaction.

**Example** (from `channels_test.go`):
```go
func TestFormatTimestamp_ValidUnixTimestamp(t *testing.T) {
	// Arrange
	ts := "1675382400"
	var sec int64 = 1675382400
	want := time.Unix(sec, 0).Format("2006-01-02 15:04")

	// Act
	got := formatTimestamp(ts)

	// Assert
	if got != want {
		t.Errorf("formatTimestamp(%q) = %q, want %q", ts, got, want)
	}
}
```

Functions tested as unit tests:
- `formatTimestamp` - Converts Slack timestamps to human-readable format
- `tsToTime` - Converts Slack timestamps to `"2006-01-02 15:04:05"` format
- `jsonResult` - Marshals values to JSON-formatted `mcp.CallToolResult`

### 2. MCP Handler Tests (Integration)

Test MCP handler functions end-to-end with a mocked Slack API client. These tests verify argument parsing, API call delegation, response formatting, and error handling.

**Example** (from `mcp_test.go`):
```go
func TestHandleListChannels_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		GetConversationsFunc: func(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error) {
			return []slackapi.Channel{
				{
					GroupConversation: slackapi.GroupConversation{
						Name:         "general",
						Conversation: slackapi.Conversation{ID: "C001"},
						Topic:        slackapi.Topic{Value: "General discussion"},
						Purpose:      slackapi.Purpose{Value: "General purpose"},
					},
					IsChannel: true,
				},
			}, "", nil
		},
	})
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleListChannels(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	text := resultText(t, result)
	if !strings.Contains(text, "general") {
		t.Errorf("expected result to contain 'general', got %q", text)
	}
}
```

Handlers tested:
- `handleListChannels` - List workspace channels
- `handleGetChannelHistory` - Get channel message history
- `handleGetThreadReplies` - Get thread replies
- `handlePostMessage` - Post a message
- `handleReplyToThread` - Reply to a thread
- `handleAddReaction` - Add emoji reaction
- `handleGetUsers` - List workspace users
- `handleGetUserProfile` - Get user profile
- `handleSearchMessages` - Search messages

### 3. Concurrency Tests

Verify that concurrent operations are data-race-free using `sync/atomic` and the `-race` flag.

**Example** (from `channels_test.go`):
```go
func TestDetectUnreadChannels_ConcurrencyNoRace(t *testing.T) {
	// Arrange: 100 channels, all with unread, verify no data race (go test -race)
	var callCount atomic.Int64
	mock := &slackutil.MockSlackAPI{
		GetConversationInfoFunc: func(input *slackapi.GetConversationInfoInput) (*slackapi.Channel, error) {
			callCount.Add(1)
			return &slackapi.Channel{
				GroupConversation: slackapi.GroupConversation{
					Name: "ch-" + input.ChannelID,
					Conversation: slackapi.Conversation{
						ID:       input.ChannelID,
						LastRead: "1675382300.000000",
					},
				},
				IsMember: true,
			}, nil
		},
		// ... (history mock omitted for brevity)
	}
	client := &slackutil.Client{User: mock}

	channels := make([]slackapi.Channel, 100)
	for i := range channels {
		channels[i] = slackapi.Channel{
			GroupConversation: slackapi.GroupConversation{
				Conversation: slackapi.Conversation{ID: fmt.Sprintf("C%03d", i)},
			},
		}
	}

	// Act
	result := detectUnreadChannels(client, channels)

	// Assert
	if len(result) != 100 {
		t.Errorf("expected 100 unread channels, got %d", len(result))
	}
	if callCount.Load() != 100 {
		t.Errorf("expected 100 GetConversationInfo calls, got %d", callCount.Load())
	}
}
```

### 4. Error Handling Tests

Test error scenarios: API failures, missing required parameters, client initialization errors, and fallback behavior.

**Example** (from `mcp_test.go`):
```go
func TestHandleListChannels_ClientError(t *testing.T) {
	cleanup := setClientError("no token")
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleListChannels(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for client error")
	}
}
```

## Writing Good Tests

### Follow AAA Pattern

```go
func TestSomething(t *testing.T) {
	// Arrange: Set up test data
	input := "1675382400"

	// Act: Execute the function
	result := formatTimestamp(input)

	// Assert: Verify the result
	if result != "2023-02-03 03:00" {
		t.Errorf("unexpected result: %s", result)
	}
}
```

### Use Descriptive Test Names

Bad:
```go
func TestFormat(t *testing.T) {}
func TestFormat2(t *testing.T) {}
```

Good:
```go
func TestFormatTimestamp_ValidUnixTimestamp(t *testing.T) {}
func TestFormatTimestamp_WithMicroseconds(t *testing.T) {}
func TestFormatTimestamp_InvalidString(t *testing.T) {}
func TestFormatTimestamp_EmptyString(t *testing.T) {}
```

### Test Edge Cases

Always test:
- Valid input (happy path)
- Invalid input (error cases)
- Boundary values (zero, empty string)
- Missing required parameters
- API error responses
- Concurrent access (with `-race`)

## Mock Strategy

### MockSlackAPI

Slamy uses a hand-written mock (`internal/slack/mock.go`) implementing the `SlackAPI` interface. Each method is backed by a function field that can be set per-test.

```go
type MockSlackAPI struct {
	GetConversationsFunc        func(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error)
	GetConversationHistoryFunc  func(params *slackapi.GetConversationHistoryParameters) (*slackapi.GetConversationHistoryResponse, error)
	PostMessageFunc             func(channelID string, options ...slackapi.MsgOption) (string, string, error)
	// ... other function fields
}
```

If a function field is `nil` and the method is called, it panics with a clear message. This ensures tests fail fast when an unexpected API call is made.

### getClientFunc Substitution

For MCP handler tests, the `getClientFunc` package-level variable is replaced to inject the mock:

```go
func setMockClient(mock *slackutil.MockSlackAPI) func() {
	orig := getClientFunc
	getClientFunc = func() (*slackutil.Client, error) {
		return &slackutil.Client{User: mock}, nil
	}
	return func() { getClientFunc = orig }
}
```

Usage pattern:
```go
func TestHandlePostMessage_Success(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{
		PostMessageFunc: func(channelID string, options ...slackapi.MsgOption) (string, string, error) {
			return channelID, "1675382400.000000", nil
		},
	})
	defer cleanup()

	// ... test logic
}
```

### Test Helpers

Test helpers in `mcp_test.go` reduce boilerplate:

- `makeRequest(args)` - Builds a `mcp.CallToolRequest` with given arguments
- `resultText(t, result)` - Extracts text from a `mcp.CallToolResult`
- `isErrorResult(result)` - Checks whether the result indicates an error
- `setMockClient(mock)` - Injects a mock client and returns a cleanup function
- `setClientError(errMsg)` - Injects a client initialization error

## Running Tests

### Basic Commands

```bash
# Run all tests
go test ./...

# Run all tests with race detector (required before submitting PRs)
go test -race ./...

# Run tests in a specific package
go test -v ./cmd/

# Run a specific test
go test -v ./cmd/ -run TestFormatTimestamp_ValidUnixTimestamp

# Run tests matching a pattern
go test -v ./cmd/ -run TestHandleListChannels

# Run tests with coverage
go test -cover ./...

# Generate coverage profile and view in browser
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Test Coverage Requirements

| Category | Requirement |
|----------|-------------|
| **New Features** | Tests required for new code |
| **Bug Fixes** | Regression test required |
| **Refactoring** | Maintain existing coverage |

## Common Testing Patterns

### Testing MCP Handlers with Parameters

```go
req := makeRequest(map[string]any{"limit": float64(2)})
result, err := handleListChannels(context.Background(), req)
```

Note: JSON numbers are `float64` in Go's `map[string]any`.

### Testing Missing Required Parameters

```go
func TestHandleGetChannelHistory_MissingChannelID(t *testing.T) {
	cleanup := setMockClient(&slackutil.MockSlackAPI{})
	defer cleanup()

	req := makeRequest(nil)
	result, err := handleGetChannelHistory(context.Background(), req)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isErrorResult(result) {
		t.Error("expected error result for missing channel_id")
	}
}
```

### Testing API Error Responses

```go
cleanup := setMockClient(&slackutil.MockSlackAPI{
	GetConversationsFunc: func(params *slackapi.GetConversationsParameters) ([]slackapi.Channel, string, error) {
		return nil, "", fmt.Errorf("api failure")
	},
})
defer cleanup()
```

### Verifying Captured Parameters

```go
var capturedParams slackapi.SearchParameters
cleanup := setMockClient(&slackutil.MockSlackAPI{
	SearchMessagesFunc: func(query string, params slackapi.SearchParameters) (*slackapi.SearchMessages, error) {
		capturedParams = params
		return &slackapi.SearchMessages{}, nil
	},
})
defer cleanup()

// ... call handler ...

if capturedParams.Count != 10 {
	t.Errorf("expected count=10, got %d", capturedParams.Count)
}
```

## Best Practices

### DO

- Write tests before or alongside code
- Use the AAA (Arrange/Act/Assert) pattern consistently
- Always use `defer cleanup()` after `setMockClient`
- Run `go test -race ./...` before submitting
- Test both success and failure paths for every handler
- Use `t.Helper()` in test helper functions
- Use `t.Fatalf()` for fatal precondition failures, `t.Errorf()` for assertion failures

### DON'T

- Skip writing tests ("I'll add them later")
- Test implementation details (test behavior, not internals)
- Write tests that depend on other tests' execution order
- Use real Slack API calls in tests
- Leave commented-out test code
- Write flaky tests (tests that sometimes fail)

## Troubleshooting

### "panic: MockSlackAPI.XxxFunc not implemented"

You need to set the corresponding function field on `MockSlackAPI` for the API call your code makes. This panic is intentional to catch unexpected API calls.

### "Tests pass locally but fail with -race"

- Ensure shared state is properly synchronized
- Use `atomic` types for counters in concurrent tests
- Avoid writing to shared slices from multiple goroutines

### "go test: no test files"

Some packages (e.g., `internal/slack`) have no test files. Tests for their functionality are in `cmd/` via integration through the mock.

## Resources

- [Go Testing Package](https://pkg.go.dev/testing)
- [Go Race Detector](https://go.dev/doc/articles/race_detector)
- [Effective Go - Testing](https://go.dev/doc/effective_go#testing)

## Questions?

If you have questions about testing:
1. Check existing test files for examples
2. Open an issue with the `question` label
