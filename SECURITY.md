# Security Policy

## Supported Versions

We release security patches for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a security vulnerability, please contact us via:

- **Email (preferred)**: t@ma-navi.co.jp
- **X (Twitter) — backup only**: [@3chhe](https://x.com/3chhe) — DMs are checked best-effort; please
  use email for anything time-sensitive (the 48-hour acknowledgment SLA below applies to email).

Please include the following information:

- Type of vulnerability (e.g., injection, authentication bypass, XSS, token leakage)
- Full paths of source file(s) related to the vulnerability
- Steps to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact assessment (especially around Slack tokens / workspace data exposure)

## Response Process

1. We will acknowledge receipt within **48 hours**
2. We will provide an initial assessment within **7 days**
3. We will release a patch and publish a security advisory after the fix is ready

## Disclosure Policy

- We follow a coordinated disclosure policy
- We ask that you give us reasonable time to address the vulnerability before public disclosure
- We will credit you in the security advisory (unless you prefer to remain anonymous)

## Scope

The following are **in scope** for security reports:

- Slack token handling and storage in the CLI / MCP server
- MCP server protocol implementation (tool invocation, authentication)
- Command injection or argument parsing flaws in `src/cli/`
- Dependency vulnerabilities affecting the published npm package

The following are **out of scope**:

- Vulnerabilities in third-party services (Slack API, Node.js runtime) — please report to the upstream vendor
- Social engineering attacks
- Issues requiring physical access to a victim's machine
