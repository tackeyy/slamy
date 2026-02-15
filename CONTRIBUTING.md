# Contributing to Slamy

Thank you for your interest in contributing to Slamy! This document provides guidelines and instructions for contributing to the project.

## Welcome

Slamy is a Slack MCP server and CLI tool written in Go. We welcome contributions from everyone, whether you're fixing a bug, adding a feature, or improving documentation.

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Before You Start](#before-you-start)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Submitting Changes](#submitting-changes)
- [Code Review Process](#code-review-process)
- [Community Guidelines](#community-guidelines)
- [Getting Help](#getting-help)

## Ways to Contribute

### You can contribute by:

- **Reporting bugs** - Found an issue? Let us know!
- **Suggesting features** - Have an idea? We'd love to hear it
- **Improving documentation** - Help make our docs clearer
- **Submitting bug fixes** - Fix issues and help improve stability
- **Adding new features** - Expand Slamy's capabilities (discuss first!)

## Before You Start

1. **Check existing issues/PRs** to avoid duplication
2. **For new features**, open an issue first to discuss the proposal
3. **Read our [Testing Guide](docs/TESTING.md)** to understand our testing approach
4. **Ensure you understand our [Code of Conduct](CODE_OF_CONDUCT.md)**

## Development Setup

### Prerequisites

- Go 1.25.2+
- A Slack User Token ([How to get one](https://api.slack.com/authentication/token-types#user))

### Setup Steps

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/slamy.git
cd slamy

# 2. Set up environment variables
export SLACK_USER_TOKEN=xoxp-your-user-token
# Optional: export SLACK_TEAM_ID=T0123456789

# 3. Run tests to verify setup
go test -race ./...

# 4. Build the project
go build -o slamy .

# 5. Test the CLI locally
./slamy --version

# 6. Test the MCP server locally
./slamy mcp
```

## Coding Standards

### Go Style

- Run `gofmt` on all code (already enforced by Go tooling)
- Follow [Effective Go](https://go.dev/doc/effective_go) conventions
- Use descriptive variable names (`channelID` not `id`)
- Export only what needs to be exported
- Add comments for exported functions and types

### Code Organization

- Keep functions small and focused (single responsibility)
- Extract complex logic into separate functions
- Add comments only when logic isn't self-evident
- Follow existing patterns in the codebase

### Commit Message Convention

Format: `<type>: <subject>`

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `test:` Test additions/changes
- `docs:` Documentation changes
- `refactor:` Code refactoring (no functional changes)
- `chore:` Maintenance tasks (dependencies, tooling)

**Examples:**
```
feat: add support for listing DMs
fix: correct timestamp parsing in formatTimestamp function
test: add validation tests for handlePostMessage handler
docs: update README with new --json flag
refactor: extract Slack client initialization to separate module
chore: update dependencies to latest versions
```

## Testing Requirements

**All code contributions MUST include tests.**

### Test Types

1. **Unit Tests** - Test individual functions in isolation (e.g., `formatTimestamp`, `tsToTime`)
2. **Handler Tests** - Test MCP handler functions with mocked Slack API
3. **Concurrency Tests** - Verify data-race-free concurrent operations
4. **Error Handling Tests** - Test error scenarios and edge cases

### Running Tests

```bash
# Run all tests
go test ./...

# Run all tests with race detector (required before submitting)
go test -race ./...

# Run specific test file
go test -v ./cmd/ -run TestFormatTimestamp

# Run tests with coverage
go test -cover ./...
```

### Test Writing Guidelines

- Follow **Arrange/Act/Assert** pattern
- Use descriptive test names: `TestFormatTimestamp_WithMicroseconds`
- Use the hand-written `MockSlackAPI` in `internal/slack/mock.go` for mocking
- Use `getClientFunc` substitution for handler-level mocking
- See **[docs/TESTING.md](docs/TESTING.md)** for the comprehensive testing guide

### Test Coverage Expectations

- **New features**: Tests required for new code
- **Bug fixes**: Add regression test reproducing the bug
- **Refactoring**: Maintain or improve existing coverage

## Submitting Changes

### Pull Request Process

#### 1. Create a branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

#### 2. Make your changes

- Write code
- Add tests
- Update documentation if needed

#### 3. Ensure quality

```bash
go test -race ./...    # All tests must pass with race detector
go build ./...         # Build must succeed
gofmt -l .             # No formatting issues
```

#### 4. Commit your changes

```bash
git add .
git commit -m "feat: add your feature description"
```

#### 5. Push and create PR

```bash
git push origin feat/your-feature-name
# Then create PR via GitHub UI
```

#### 6. Fill out PR template

- Describe what changed and why
- Link related issues with `Closes #123`
- Provide testing evidence
- Check all applicable boxes in the template

### PR Requirements Checklist

Before submitting, ensure:

- All tests pass (`go test -race ./...`)
- Build succeeds (`go build ./...`)
- Code is formatted (`gofmt`)
- Code follows project style
- Commit messages follow convention
- Tests added for new functionality
- Documentation updated (if applicable)
- PR template fully completed

### What to Expect

- **Initial review** within 2-3 business days
- **Feedback** and requested changes from maintainers
- **Approval and merge** once all requirements are met

## Code Review Process

### For Contributors

- **Be responsive** to feedback and questions
- **Ask for clarification** if feedback is unclear
- **Push updates** to the same branch (PR will auto-update)
- **Be patient and respectful** throughout the process

### Review Criteria

Reviewers will check:

- **Functionality** - Does it work as intended?
- **Tests** - Are they comprehensive and passing?
- **Code Quality** - Is it readable and maintainable?
- **Documentation** - Is it clear and up-to-date?
- **Performance** - Are there any obvious performance issues?
- **Security** - Are there any potential vulnerabilities?

## Community Guidelines

- Be respectful and welcoming to all contributors
- Follow our [Code of Conduct](CODE_OF_CONDUCT.md)
- Provide constructive feedback
- Assume good intentions
- Help others learn and grow

## Getting Help

- **Bug Reports** - Open an [Issue](https://github.com/tackeyy/slamy/issues/new?template=bug_report.yml)
- **Feature Requests** - Open an [Issue](https://github.com/tackeyy/slamy/issues/new?template=feature_request.yml)
- **General Questions** - Open an [Issue](https://github.com/tackeyy/slamy/issues/new?template=question.yml)

## Recognition

All contributors are recognized in:

- GitHub Contributors page
- Release notes (for significant contributions)

---

Thank you for contributing to Slamy! Your efforts help make this tool better for everyone.
