# slamy — Slack MCP server & CLI

[日本語](README_ja.md)

A Slack [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that also works as a standalone CLI. Connect AI agents like Claude to your Slack workspace, or use it directly from the terminal.

## Features

- **MCP Server** — expose Slack operations as MCP tools for AI agents (Claude Code, Claude Desktop, etc.)
- **CLI** — use the same operations directly from the terminal
- **Channels** — list channels, retrieve message history
- **Messages** — post messages, reply to threads
- **Users** — list workspace members, view profiles
- **Reactions** — add emoji reactions to messages
- **Search** — search messages across channels with Slack query syntax
- **Multiple output formats** — human-readable text, JSON, and TSV

## Installation

### Homebrew

```bash
brew install tackeyy/tap/slamy
```

### Go

```bash
go install github.com/tackeyy/slamy@latest
```

### Build from source

```bash
git clone https://github.com/tackeyy/slamy.git
cd slamy
go build -o slamy .
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

slamy was built as part of an **AI secretary / personal assistant** (Claude Code + MCP) that reads, searches, and posts to Slack on behalf of a specific user. In this use case, User Token is the natural choice:

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

These flags work with any command:

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

### `users list` / `users profile`

```bash
slamy users list [--include-deactivated] [--include-bots]
slamy users profile <user_id>
```

### `reactions get` — Get reactions on a specific message

```bash
slamy reactions get <channel_or_url> [timestamp] [--resolve-names]
```

Returns the emoji reactions and the users who added them. Useful before calling `reactions add` to check existing reactions.

### `reactions list` — List reactions made by a user

```bash
slamy reactions list [--user <user_id>] [--limit <n>] [--count]
```

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

### `mcp` — Start MCP server

```bash
slamy mcp
```

Starts an MCP server over stdio, exposing all operations as tools for AI agents (e.g., Claude Code).

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SLACK_USER_TOKEN` | Yes (either) | Slack User OAuth Token (`xoxp-...`) — required for `search messages` and most read operations |
| `SLACK_BOT_TOKEN` | Yes (either) | Slack Bot OAuth Token (`xoxb-...`) — used for write operations and `reactions get` |
| `SLAMY_TZ` | No | IANA timezone used by `engagement` commands (default: `Asia/Tokyo`) |
| `SLACK_TEAM_ID` | No | Slack Team ID (for workspace-specific operations) |

At least one of `SLACK_USER_TOKEN` / `SLACK_BOT_TOKEN` must be set. When both are set, slamy uses each token for the operations it best fits.

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

## MCP Server

### Usage with Claude Code

```bash
claude mcp add slamy /path/to/slamy mcp
```

### Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "slamy": {
      "command": "/path/to/slamy",
      "args": ["mcp"],
      "env": {
        "SLACK_USER_TOKEN": "xoxp-your-user-token"
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|---|---|
| `slack_list_channels` | List all channels |
| `slack_get_channel_history` | Get channel message history |
| `slack_get_thread_replies` | Get thread replies |
| `slack_post_message` | Post a message to a channel |
| `slack_reply_to_thread` | Reply to a thread |
| `slack_add_reaction` | Add emoji reaction |
| `slack_get_users` | List workspace users |
| `slack_get_user_profile` | Get user profile |
| `slack_search_messages` | Search messages |

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
- [Model Context Protocol](https://modelcontextprotocol.io/)
