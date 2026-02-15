# Contributing to slamy

Thank you for your interest in contributing to slamy! This document provides guidelines and
instructions for contributing to the project.

## 🙏 Welcome!

slamy is a Go application. We welcome contributions from everyone, whether you're fixing
a bug, adding a feature, or improving documentation.

## 📖 Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Submitting Changes](#submitting-changes)
- [Code Review Process](#code-review-process)
- [Community Guidelines](#community-guidelines)
- [Getting Help](#getting-help)

## 🎯 Ways to Contribute

- **Bug Reports**: Found a bug? Open an issue with reproduction steps
- **Feature Requests**: Have an idea? Share it in a feature request issue
- **Code Contributions**: Submit pull requests for bug fixes or features
- **Documentation**: Improve README, add examples, or fix typos
- **Testing**: Add test cases or improve test coverage
- **Code Review**: Review open pull requests

## 🛠️ Development Setup

### Prerequisites

- Go 1.21 or higher
- Git

### Getting Started

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/tackeyy/slamy.git
   cd slamy
   ```

2. **Install dependencies**
   ```bash
   go mod download
   ```

3. **Run tests to verify setup**
   ```bash
   go test ./...
   ```

4. **Build the project**
   ```bash
   go build
   ```

## 📝 Coding Standards

### Go Style

- Follow official [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- Use `gofmt` for formatting (enforced by CI)
- Use `golangci-lint` for static analysis
- Keep functions small and focused
- Write descriptive variable names (avoid single letters except for loops)
- Add comments for exported functions and types

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Adding or updating tests
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

Example:
```
feat: add user authentication handler

Implements JWT-based authentication for API endpoints.
Includes middleware for token validation.
```

## ✅ Testing Requirements

See [docs/TESTING.md](docs/TESTING.md) for detailed testing guidelines.

### Test Types

1. **Unit Tests**: For individual functions and methods
2. **Integration Tests**: For component interactions
3. **Table-driven Tests**: For testing multiple scenarios

### Running Tests

```bash
# Run all tests
go test ./...

# Run with coverage
go test -cover ./...

# Run with race detector
go test -race ./...

# Run specific package
go test ./pkg/auth/...
```

### Test Coverage Expectations

- New features: 80%+ coverage required
- Bug fixes: Add test that reproduces the bug
- All tests must pass before merging

## 📤 Submitting Changes

### Before Submitting

1. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Add tests for new functionality
   - Update documentation as needed

3. **Run tests and linters**
   ```bash
   go test ./...
   golangci-lint run
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push to your fork**
   ```bash
   git push origin feat/your-feature-name
   ```

6. **Open a Pull Request**
   - Use the PR template
   - Link related issues
   - Describe your changes clearly

## 🔍 Code Review Process

### For Contributors

- Be responsive to feedback
- Keep discussions constructive
- Update your PR based on review comments
- Be patient - reviews may take a few days

### Review Criteria

- ✅ Functionality: Does it work as intended?
- ✅ Tests: Are there adequate tests?
- ✅ Code Quality: Is it readable and maintainable?
- ✅ Documentation: Are changes documented?
- ✅ Style: Does it follow Go conventions?

## 🤝 Community Guidelines

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

### Recognition

Contributors are recognized in:
- GitHub Contributors page
- Release notes for significant contributions

## 💬 Getting Help

- **Questions**: Open a [Question issue](.github/ISSUE_TEMPLATE/question.yml)
- **Discussion**: Use GitHub Discussions (if enabled)
- **Bugs**: Open a [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml)

---

Thank you for contributing to slamy! 🎉
