# Testing Guide for slamy

This document describes the testing strategy, guidelines, and best practices for the
**Node.js / TypeScript** side of slamy. For the Go binary under `go-src/`, see
`go-src/` source and standard `go test ./...` workflows.

## 🎯 Testing Philosophy

- **Write tests first** when fixing bugs (TDD: red → green → refactor)
- **Test behavior, not implementation** — assert on observable output
- **Keep tests simple and readable** — one concept per test
- **Mock external dependencies** — never hit the real Slack API
- **Fast execution** — unit tests should run in milliseconds

## 📚 Testing Framework

slamy uses **[Vitest](https://vitest.dev/)** as its test runner and assertion library, configured
via `vitest.config.ts`. Vitest is API-compatible with Jest, so most Jest patterns work unchanged.

Key tooling:

- `vitest` — runner + assertions (`expect`, `describe`, `it`)
- `vi` — mocking (`vi.fn()`, `vi.spyOn()`, `vi.mock()`)
- `@vitest/coverage-v8` — coverage (V8 provider)

## 🏗️ Test Structure

### Directory layout

```text
src/
├── cli/
│   └── index.ts                    # CLI entry point
├── lib/
│   ├── client.ts                   # Slack client wrappers
│   ├── split.ts                    # message splitting
│   ├── ...
│   └── __tests__/                  # library unit tests (colocated)
│       ├── client.test.ts
│       ├── split.test.ts
│       └── ...
└── __tests__/                      # CLI / integration-flavored tests
    ├── client.test.ts
    ├── engagement.test.ts
    ├── cli-validation.test.ts      # CLI argument validation
    ├── cli-output.test.ts          # CLI output formatting (text / JSON / TSV)
    ├── cli-errors.test.ts          # error classes + exit codes
    └── helpers/
        └── mock-slack.ts
```

### Naming conventions

- Test files: `*.test.ts`
- Test suites: `describe("ModuleName - functionality", () => { ... })`
- Test cases: `it("should do something specific", () => { ... })`

## ✍️ Writing Tests

### 1. Unit tests

Test individual exported functions in isolation.

```ts
import { describe, it, expect } from "vitest";
import { splitForPostMessage } from "../split.js";

describe("splitForPostMessage", () => {
  it("returns a single chunk when input fits in one message", () => {
    const chunks = splitForPostMessage("hello");
    expect(chunks).toEqual(["hello"]);
  });

  it("splits a long string into multiple chunks", () => {
    const chunks = splitForPostMessage("x".repeat(10000));
    expect(chunks.length).toBeGreaterThan(1);
  });
});
```

### 2. Validation tests

Test CLI argument validation logic (parsers, numeric bounds, enums).

```ts
import { describe, it, expect } from "vitest";

describe("CLI validation - reactions get", () => {
  it("rejects empty channel id", () => {
    const channel = "";
    expect(channel.length > 0).toBe(false);
  });

  it("rejects ts not matching Slack timestamp format", () => {
    const ts = "not-a-timestamp";
    expect(/^\d+\.\d+$/.test(ts)).toBe(false);
  });
});
```

### 3. Output tests

Test CLI output formatting by spying on `process.stdout.write`.

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("CLI output - text format", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it("prints a single line per row", () => {
    process.stdout.write("row1\n");
    expect(stdoutSpy).toHaveBeenCalledWith("row1\n");
  });
});
```

### 4. Error handling tests

Test error classes and exit codes.

```ts
import { describe, it, expect } from "vitest";

class ValidationError extends Error {
  readonly exitCode = 2;
}

describe("ValidationError", () => {
  it("exposes exit code 2", () => {
    const err = new ValidationError("--channel required");
    expect(err.exitCode).toBe(2);
  });

  it("is an instance of Error", () => {
    const err = new ValidationError("boom");
    expect(err instanceof Error).toBe(true);
  });
});
```

### 5. Mocking the Slack client

Mock `@slack/web-api` so tests never hit real Slack.

```ts
import { vi } from "vitest";

vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: "1700000000.000100" }),
    },
    conversations: {
      list: vi.fn().mockResolvedValue({ ok: true, channels: [] }),
    },
  })),
}));
```

See `src/__tests__/helpers/mock-slack.ts` for the shared helper.

## 🏃 Running Tests

### Basic commands

```bash
# Run all tests once (CI-style)
npm test

# Watch mode for local development
npm run test:watch

# Run a single file
npx vitest run src/lib/__tests__/split.test.ts

# Filter by test name
npx vitest run -t "splits a long string"

# Run with coverage
npx vitest run --coverage
```

### Coverage report

```bash
npx vitest run --coverage
# HTML report: coverage/index.html
# lcov: coverage/lcov.info
```

## 📊 Test Coverage

### Coverage thresholds (enforced by `vitest.config.ts`)

| Metric     | Threshold |
| ---------- | --------- |
| Lines      | 80%       |
| Functions  | 80%       |
| Branches   | 80%       |
| Statements | 80%       |

### Coverage exclusions

- `src/cli/index.ts` — large CLI entry point; exercised via focused validation / output / error
  tests rather than full-file execution coverage
- `**/*.d.ts` — type declarations

### Per-change expectations

- **New features**: aim for 100% coverage of new code
- **Bug fixes**: add a regression test that fails before the fix and passes after
- **Refactors**: maintain or improve existing coverage

## ✅ Pre-PR Test Checklist

Before submitting a PR, ensure:

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npx vitest run --coverage` meets thresholds
- [ ] New behavior has a unit test
- [ ] Bug fixes include a regression test
- [ ] External dependencies (`@slack/web-api`, `fetch`, env vars) are mocked
- [ ] Both success and failure paths are covered

## 🎯 Best Practices

### DO ✅

- Use `vi.resetModules()` between tests when you re-import modules
- Mock all external I/O (`fetch`, Slack API, filesystem)
- Test both happy path and error path
- Use descriptive test names: `it("rejects ts without dot separator", ...)`
- Follow **Arrange → Act → Assert**
- Use `vi.useFakeTimers()` for time-dependent code

### DON'T ❌

- Don't call the real Slack API
- Don't share state between tests (each test must be independent)
- Don't write tests that assert on private implementation details
- Don't leave commented-out tests
- Don't use `setTimeout` to wait for async work — use `await`

## 🔧 Troubleshooting

### "Cannot find module './foo'" with NodeNext

The project uses `module: NodeNext`, so relative imports require the `.js` extension even in
TypeScript source:

```ts
// ✅ correct
import { foo } from "./foo.js";

// ❌ wrong (works in bundler resolution but not NodeNext)
import { foo } from "./foo";
```

### "Tests pass locally but fail in CI"

- Check for timezone assumptions — use explicit TZ in `formatDate` calls
- Make sure every `vi.spyOn` / `vi.mock` is restored in `afterEach`
- Run `npm ci` (not `npm install`) to match CI's lockfile-only behavior

### "Coverage threshold not met"

- Run `npx vitest run --coverage` and open `coverage/index.html`
- Look for red/yellow files and add tests for the uncovered branches
- If a file is genuinely impossible to cover (e.g., CLI bootstrap), add it to
  `coverage.exclude` in `vitest.config.ts` with a code comment explaining why

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vitest API Reference](https://vitest.dev/api/)
- [Slack Web API](https://api.slack.com/web)
- [@slack/web-api Node SDK](https://github.com/slackapi/node-slack-sdk)

---

**Questions?** Open a [Question issue](../.github/ISSUE_TEMPLATE/question.yml) or refer to
[CONTRIBUTING.md](../CONTRIBUTING.md).
