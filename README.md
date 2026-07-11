# slamy — Slack API client & CLI

**English** | [日本語](README.ja.md)

A Slack API client and standalone CLI for reading, searching, and posting to Slack.

## Features

- **CLI** — run Slack operations directly from the terminal
- **TypeScript API client** — use `SlamyClient` from Node.js applications
- **Socket Mode events** — subscribe to Slack events with `SlamyEvents`
- **Channels** — list channels, retrieve message history
- **Messages** — post messages, reply to threads
- **Users** — list workspace members, view profiles
- **Reactions** — add emoji reactions to messages
- **Search** — search messages across channels with Slack query syntax
- **Multiple output formats** — human-readable text, JSON, and TSV

## Installation

### npm (TypeScript API and CLI)

```bash
npm install slamy
```

### Homebrew

```bash
brew install tackeyy/tap/slamy
```

### Go

```bash
go install github.com/tackeyy/slamy@latest
```

### Build the Go CLI from source

```bash
git clone https://github.com/tackeyy/slamy.git
cd slamy/go-src
go build -o ../slamy .
```

## Quick Start

### 1. Create a Slack App

1. Go to [Slack API](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**, name your app (e.g., `slamy`)
3. Select the workspace to install to

### 2. Configure User Token Scopes

In **OAuth & Permissions** > **Scopes** > **User Token Scopes**, add:

| Scope | Purpose |
|---|---|
| `channels:history` | View messages in public channels |
| `channels:read` | View basic channel info |
| `chat:write` | Send messages (as yourself) |
| `files:read` | Download files shared in channels |
| `groups:history` | View messages in private channels |
| `groups:read` | View basic private channel info |
| `reactions:write` | Add emoji reactions |
| `search:read` | Search messages |
| `users:read` | View users and their basic info |
| `users:read.email` | View email addresses |
| `users.profile:read` | View user profiles |
| `team:read` | View workspace (team) info |

### 3. Install and Set Environment Variables

Install the app to your workspace, then set your token:

```bash
export SLACK_USER_TOKEN=xoxp-your-user-token
```

### 4. Run

```bash
./slamy channels list
```

## User Token vs Bot Token

Slack Apps can issue two types of tokens. Which one to use depends on your use case.

| | Bot Token (`xoxb-`) | User Token (`xoxp-`) |
|---|---|---|
| Message search (`search:read`) | **Not available** | Available |
| Token management | Need 2 tokens if search is required | 1 token for everything |
| Message posting | Posts as "app" (bot name) | Posts as the user |
| Private channel access | Must be invited to channel | Access same channels as the user |

### Use User Token when: acting on behalf of a user

slamy supports applications that read, search, and post to Slack on behalf of a specific user. In this use case, User Token is the natural choice:

1. **Search requires it** — `search:read` is a User Token-only scope. Bot Tokens simply cannot search messages
2. **Single token** — no need to manage two tokens and worry about which operation uses which
3. **User context** — messages posted by the agent appear as the user, making it clear who is responsible
4. **Channel access** — the agent can access the same channels as the user without manual invitation

### Use Bot Token when: building a bot

Bot Token is the right choice if you are building a Slack bot (not a personal assistant):

- The bot has its own identity and posts as "app name", not as a specific user
- Multiple users interact with the bot — it shouldn't act as any single user
- You want to control access by inviting the bot only to specific channels
- You don't need message search, or can accept the limitation

## Commands

### `channels list` — List channels

```bash
slamy channels list [--limit <number>] [--include-archived] [--json] [--plain]
```

| Flag | Required | Description |
|---|---|---|
| `--limit <number>` | No | Maximum number of channels to return |
| `--include-archived` | No | Include archived channels |
| `--json` | No | Output as JSON |
| `--plain` | No | Output as TSV |

### Global options

slamy provides separate Go and TypeScript CLI implementations. The available
root options depend on which CLI you installed.

Go CLI (`go install` or a source build):

| Flag | Description |
|---|---|
| `--workspace <alias>` | Use the configured Slack workspace alias for this invocation |
| `--json` | Output as JSON |
| `--plain` | Output as TSV |

TypeScript CLI (`npm install`):

| Flag | Description |
|---|---|
| `--json` | Output as JSON |
| `--plain` | Output as TSV |
| `--utc` | Display timestamps in UTC (default: local TZ) |
| `--tz <iana>` | Display timestamps in the specified IANA timezone (e.g. `Asia/Tokyo`) |

### `channels history` — Get channel message history

```bash
slamy channels history <channel_or_url> [--limit <n>] [--oldest <ts>] [--latest <ts>] [--resolve-names]
```

| Flag | Required | Description |
|---|---|---|
| `<channel_or_url>` | Yes | Channel ID **or** Slack permalink URL |
| `--limit <n>` | No | Number of messages (default: 20) |
| `--oldest <ts>` | No | Only messages after this Unix timestamp |
| `--latest <ts>` | No | Only messages before this Unix timestamp |
| `--resolve-names` | No | Resolve `user_id` / `bot_id` to display names |

### `messages post` — Post a message

```bash
slamy messages post <channel_id> --text <message>
```

### `messages reply` — Reply to a thread

```bash
slamy messages reply <channel_or_url> [thread_ts] --text <message> [--broadcast]
```

`<channel_or_url>` accepts either a channel ID + thread_ts, or a single Slack permalink URL.

### `messages update` / `messages delete` — Edit messages

```bash
slamy messages update <channel_or_url> [ts] --text <new_text>
slamy messages delete <channel_or_url> [ts]
```

### `messages schedule` — Schedule a message for later

```bash
slamy messages schedule <channel_id> --text <message> --at <datetime>
```

`<datetime>` is a Unix timestamp or ISO 8601 (e.g. `2026-02-24T09:00+09:00`).

### `threads replies` — Get thread replies

```bash
slamy threads replies <channel_or_url> [thread_ts] [--limit <n>] [--resolve-names]
```

`<channel_or_url>` accepts a channel ID + thread_ts, or a single Slack permalink URL.

### `channels members` — List channel members

```bash
slamy channels members <channel_or_url> [--resolve-names]
```

`<channel_or_url>` accepts a channel ID or a Slack permalink URL. `--resolve-names` resolves `user_id` to display names.

### `users list` / `users profile`

```bash
slamy users list [--include-deactivated] [--include-bots]
slamy users profile <user_id>
```

### `assistant set-status` — Set AI Assistant thread status

```bash
slamy assistant set-status --channel <id> --thread <ts> --status <text> [--loading-message <text...>]
```

Sets the typing indicator status on an AI Assistant thread. Use `--plain` for machine-readable TSV output (`ok\t<channel>\t<thread>`), suitable for CI / shell scripting.

### `reactions get` — Get reactions on a specific message

```bash
slamy reactions get <channel_or_url> [timestamp] [--resolve-names]
```

Returns the emoji reactions and the users who added them. Useful before calling `reactions add` to check existing reactions.

### `reactions list` — List reactions made by a user

```bash
slamy reactions list [--user <user_id>] [--limit <n>] [--count] [--resolve-names]
```

`--resolve-names` resolves `channel_id` to channel names (`#general` instead of `#C0123ABCDE`).

Note: `reactions list` (lists reactions *by* a user) and `reactions get` (gets reactions *on* a message) are different APIs.

### `reactions add` / `reactions remove` — Add/remove emoji reaction

```bash
slamy reactions add <channel_or_url> [timestamp] --name <emoji>
slamy reactions remove <channel_or_url> [timestamp] --name <emoji>
```

### `search messages` — Search messages

```bash
slamy search messages <query> [--count <n>] [--page <n>] [--sort <field>] [--sort-dir <dir>] [--resolve-names]
```

| Flag | Required | Description |
|---|---|---|
| `<query>` | Yes | Search query (supports Slack modifiers like `in:#channel`, `from:@user`) |
| `--count <n>` | No | Results per page (default: 20) |
| `--page <n>` | No | Page number (default: 1) |
| `--sort <field>` | No | Sort by `timestamp` or `score` (default: timestamp) |
| `--sort-dir <dir>` | No | `asc` or `desc` (default: desc) |
| `--resolve-names` | No | Resolve `user_id` to display names |

### `auth test` — Test authentication

```bash
slamy auth test [--json] [--plain]
```

### `team info` — Get workspace info

```bash
slamy team info [--json] [--plain]
```

Returns the workspace domain, `email_domain`, and Enterprise info. The `email_domain` is useful for diagnosing SSO domain mismatches. Requires the `team:read` scope. Note: SSO enforcement settings are **not** exposed by the Slack API.

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SLAMY_WORKSPACE_<ALIAS>_USER_TOKEN` | When its alias is selected | User OAuth Token for a workspace alias; uppercase the alias and replace hyphens with underscores |
| `SLAMY_DEFAULT_WORKSPACE` | No | Workspace alias to use when `--workspace` is omitted |
| `SLACK_USER_TOKEN` | Yes for legacy single-workspace use | Legacy Slack User OAuth Token (`xoxp-...`) — used only when neither an explicit nor default alias is selected |
| `SLACK_BOT_TOKEN` | Yes (either) | Slack Bot OAuth Token (`xoxb-...`) — used for write operations and `reactions get` |
| `SLAMY_TZ` | No | IANA timezone used by `engagement` commands (default: `Asia/Tokyo`) |
| `SLACK_TEAM_ID` | No | Slack Team ID (for workspace-specific operations) |

When both `SLACK_USER_TOKEN` and `SLACK_BOT_TOKEN` are set in legacy mode, slamy uses each token for the operations it best fits.

### Multiple Workspaces

A workspace alias is a local identifier. It is independent of the workspace name, domain, and Team ID in Slack, and slamy does not discover or match aliases automatically. An alias must be 1–63 characters and match `^[a-z0-9]+(?:-[a-z0-9]+)*$` (for example, `primary`, `operations`, or `project-a`).

Configure one User OAuth Token for each alias. The environment variable name is formed by uppercasing the alias and replacing hyphens with underscores:

```bash
export SLAMY_DEFAULT_WORKSPACE=primary
export SLAMY_WORKSPACE_PRIMARY_USER_TOKEN='<user-token>'
export SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN='<user-token>'
export SLAMY_WORKSPACE_PROJECT_A_USER_TOKEN='<user-token>'
```

The workspace selection order is:

1. The root persistent flag `--workspace <alias>`
2. `SLAMY_DEFAULT_WORKSPACE`
3. Legacy `SLACK_USER_TOKEN`, only when neither alias source is set

There is no `SLAMY_WORKSPACE` selector environment variable; use `--workspace` for an explicit selection.

```bash
# Uses the default alias, primary
slamy channels list

# Explicit selection takes precedence over the default
slamy --workspace operations channels list
slamy --workspace project-a auth test
```

Alias selection is fail-closed. If `--workspace` or `SLAMY_DEFAULT_WORKSPACE` selects an alias but its `SLAMY_WORKSPACE_<ALIAS>_USER_TOKEN` is missing, slamy returns an error instead of falling back to `SLACK_USER_TOKEN` or another alias.

Existing single-workspace setups remain compatible: keep `SLACK_USER_TOKEN` and leave both `--workspace` and `SLAMY_DEFAULT_WORKSPACE` unset. To migrate, move that token to an alias-specific variable, set `SLAMY_DEFAULT_WORKSPACE` to the alias, then remove `SLACK_USER_TOKEN` after verifying the new setup.

Treat every token as a secret. Do not commit tokens to a repository, pass them as command-line arguments, or print them to logs, standard output, standard error, or JSON. Provide them through protected environment or secret-management facilities.

## Output Formats

### Text (default)

```
#general                       C01234ABCDE  [42 members]
#random                        C01234FGHIJ (private)  [15 members]
```

### JSON (`--json`)

```json
[
  {
    "id": "C01234ABCDE",
    "name": "general",
    "num_members": 42,
    "is_private": false
  }
]
```

### TSV (`--plain`)

```
C01234ABCDE	general	42	public
C01234FGHIJ	random	15	private
```

## TypeScript API

The npm package exports `SlamyClient` for Slack Web API operations and `SlamyEvents` for Socket Mode events. Node.js 25 or later is required.

```ts
import { SlamyClient } from "slamy";

const client = new SlamyClient({ userToken: process.env.SLACK_USER_TOKEN });
const channels = await client.listChannels();
```

Pass tokens through protected environment or secret-management facilities. See the exported TypeScript types for the complete API surface.

## Development

```bash
# Build
go build -o slamy .

# Run all tests with race detector
go test -race ./...

# Run tests with coverage
go test -cover ./...
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and coding standards.
See [docs/TESTING.md](docs/TESTING.md) for the comprehensive testing guide.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a Pull Request.

All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT

## Links

- [GitHub Repository](https://github.com/tackeyy/slamy)
- [Slack API Documentation](https://api.slack.com/docs)
