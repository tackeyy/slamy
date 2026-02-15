# Testing Guide for slamy

This document describes the testing strategy, guidelines, and best practices for slamy.

## 🎯 Testing Philosophy

- **Write tests first** when fixing bugs
- **Test behavior, not implementation**
- **Keep tests simple and readable**
- **Use table-driven tests** for multiple scenarios
- **Mock external dependencies**

## 📚 Testing Framework

slamy uses Go's built-in testing package along with:
- `testing` - Standard Go testing package
- `testify/assert` - Assertion helpers (optional)
- `testify/mock` - Mocking framework (optional)
- `httptest` - HTTP testing utilities

## 🏗️ Test Structure

### Directory Layout

```
slamy/
├── cmd/
│   └── app/
│       └── main_test.go
├── internal/
│   ├── handler/
│   │   ├── handler.go
│   │   └── handler_test.go
│   └── service/
│       ├── service.go
│       └── service_test.go
└── pkg/
    └── util/
        ├── util.go
        └── util_test.go
```

### Naming Convention

- Test files: `*_test.go`
- Test functions: `func TestFunctionName(t *testing.T)`
- Benchmark functions: `func BenchmarkFunctionName(b *testing.B)`

## ✍️ Writing Tests

### Unit Test Example

```go
package handler

import (
    "testing"
)

func TestUserHandler_GetByID(t *testing.T) {
    // Arrange
    handler := NewUserHandler()
    userID := "123"

    // Act
    user, err := handler.GetByID(userID)

    // Assert
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if user.ID != userID {
        t.Errorf("expected user ID %s, got %s", userID, user.ID)
    }
}
```

### Table-Driven Test Example

```go
func TestValidateEmail(t *testing.T) {
    tests := []struct {
        name    string
        email   string
        want    bool
        wantErr bool
    }{
        {
            name:    "valid email",
            email:   "user@example.com",
            want:    true,
            wantErr: false,
        },
        {
            name:    "invalid email - no @",
            email:   "userexample.com",
            want:    false,
            wantErr: true,
        },
        {
            name:    "empty email",
            email:   "",
            want:    false,
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := ValidateEmail(tt.email)
            if (err != nil) != tt.wantErr {
                t.Errorf("ValidateEmail() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            if got != tt.want {
                t.Errorf("ValidateEmail() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

### HTTP Handler Test Example

```go
func TestHealthHandler(t *testing.T) {
    req := httptest.NewRequest("GET", "/health", nil)
    w := httptest.NewRecorder()

    HealthHandler(w, req)

    resp := w.Result()
    if resp.StatusCode != http.StatusOK {
        t.Errorf("expected status 200, got %d", resp.StatusCode)
    }
}
```

## 🎭 Mocking

### Interface-based Mocking

```go
// Define interface
type UserRepository interface {
    GetByID(id string) (*User, error)
}

// Mock implementation for testing
type MockUserRepository struct {
    GetByIDFunc func(id string) (*User, error)
}

func (m *MockUserRepository) GetByID(id string) (*User, error) {
    if m.GetByIDFunc != nil {
        return m.GetByIDFunc(id)
    }
    return nil, nil
}
```

## 🏃 Running Tests

### Basic Commands

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Generate coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out

# Run specific package
go test ./internal/handler/...

# Run specific test
go test -run TestUserHandler_GetByID ./internal/handler

# Run with race detector
go test -race ./...

# Verbose output
go test -v ./...
```

### Benchmarks

```bash
# Run all benchmarks
go test -bench=. ./...

# Run specific benchmark
go test -bench=BenchmarkValidateEmail ./...

# With memory allocation stats
go test -bench=. -benchmem ./...
```

## 📊 Test Coverage

### Coverage Requirements

- **Overall**: 70%+ coverage required
- **New features**: 80%+ coverage required
- **Critical paths**: 90%+ coverage required
- **Bug fixes**: Must include regression test

### Check Coverage

```bash
# Generate coverage report
go test -coverprofile=coverage.out ./...

# View coverage by package
go tool cover -func=coverage.out

# View HTML coverage report
go tool cover -html=coverage.out
```

## ✅ Test Checklist

Before submitting a PR, ensure:

- [ ] All tests pass: `go test ./...`
- [ ] Coverage is adequate: `go test -cover ./...`
- [ ] Race detector passes: `go test -race ./...`
- [ ] Tests are table-driven where appropriate
- [ ] External dependencies are mocked
- [ ] Edge cases are tested
- [ ] Error cases are tested

## 🎯 Best Practices

1. **Use subtests** for organizing related tests
2. **Test public APIs** rather than internal implementation
3. **Keep tests independent** - avoid test interdependencies
4. **Use meaningful test names** - describe what's being tested
5. **Test error handling** - don't just test happy paths
6. **Avoid test helpers that hide logic** - keep tests explicit
7. **Use test fixtures** for complex test data
8. **Clean up resources** using `t.Cleanup()` or `defer`

## 🔧 Integration Tests

### Running Integration Tests

```bash
# Run with build tag
go test -tags=integration ./...

# Skip integration tests
go test -short ./...
```

### Example Integration Test

```go
//go:build integration
// +build integration

package integration

import (
    "testing"
)

func TestDatabaseIntegration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test")
    }

    // Integration test code
}
```

## 📚 Resources

- [Go Testing Package](https://pkg.go.dev/testing)
- [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments#tests)
- [Table Driven Tests](https://github.com/golang/go/wiki/TableDrivenTests)
- [Testify Documentation](https://github.com/stretchr/testify)

---

**Questions?** Open an issue or refer to [CONTRIBUTING.md](../CONTRIBUTING.md)
