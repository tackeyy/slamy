# slamy — Slack in your terminal.

A CLI tool for Slack operations with MCP (Model Context Protocol) server support. Both human-friendly and AI-agent-ready.

## Features

- **Channels** — list channels, retrieve message history
- **Messages** — post messages, reply to threads
- **Users** — list workspace members, view profiles
- **Reactions** — add emoji reactions to messages
- **Search** — search messages across channels with Slack query syntax
- **MCP Server** — expose all operations as MCP tools for AI agent integration
- **Multiple output formats** — human-readable text, JSON, and TSV

## Installation

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

### 2. Configure Bot Token Scopes

In **OAuth & Permissions** > **Scopes** > **Bot Token Scopes**, add:

- `channels:history` — view messages in public channels
- `channels:read` — view basic channel info
- `chat:write` — send messages
- `groups:history` — view messages in private channels
- `groups:read` — view basic private channel info
- `reactions:write` — add emoji reactions
- `users:read` — view users and their basic info
- `users:read.email` — view email addresses
- `users.profile:read` — view user profiles

For message search, also add a **User Token Scope**:

- `search:read` — search messages

### 3. Install and Set Environment Variables

Install the app to your workspace, then set your tokens:

```bash
export SLACK_BOT_TOKEN=xoxb-your-bot-token
export SLACK_USER_TOKEN=xoxp-your-user-token  # optional, for search
```

### 4. Run

```bash
./slamy channels list
```

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

### `channels history` — Get channel message history

```bash
slamy channels history <channel_id> [--limit <number>] [--json] [--plain]
```

| Flag | Required | Description |
|---|---|---|
| `<channel_id>` | Yes | Channel ID |
| `--limit <number>` | No | Number of messages (default: 20) |

### `messages post` — Post a message

```bash
slamy messages post <channel_id> --text <message> [--json] [--plain]
```

| Flag | Required | Description |
|---|---|---|
| `<channel_id>` | Yes | Channel ID |
| `--text <message>` | Yes | Message text |

### `messages reply` — Reply to a thread

```bash
slamy messages reply <channel_id> <thread_ts> --text <message> [--json] [--plain]
```

| Flag | Required | Description |
|---|---|---|
| `<channel_id>` | Yes | Channel ID |
| `<thread_ts>` | Yes | Thread timestamp |
| `--text <message>` | Yes | Reply text |

### `users list` — List workspace users

```bash
slamy users list [--include-deactivated] [--include-bots] [--json] [--plain]
```

| Flag | Required | Description |
|---|---|---|
| `--include-deactivated` | No | Include deactivated users |
| `--include-bots` | No | Include bot users |

### `users profile` — Get user profile

```bash
slamy users profile <user_id> [--json] [--plain]
```

| Flag | Required | Description |
|---|---|---|
| `<user_id>` | Yes | User ID |

### `reactions add` — Add emoji reaction

```bash
slamy reactions add <channel_id> <timestamp> --name <emoji> [--json] [--plain]
```

| Flag | Required | Description |
|---|---|---|
| `<channel_id>` | Yes | Channel ID |
| `<timestamp>` | Yes | Message timestamp |
| `--name <emoji>` | Yes | Emoji name (without colons) |

### `search messages` — Search messages

```bash
slamy search messages <query> [--count <number>] [--page <number>] [--sort <field>] [--sort-dir <direction>] [--json] [--plain]
```

| Flag | Required | Description |
|---|---|---|
| `<query>` | Yes | Search query (supports Slack modifiers like `in:#channel`, `from:@user`) |
| `--count <number>` | No | Results per page |
| `--page <number>` | No | Page number |
| `--sort <field>` | No | Sort field |
| `--sort-dir <direction>` | No | Sort direction |

Requires `SLACK_USER_TOKEN` environment variable.

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
| `SLACK_BOT_TOKEN` | Yes | Slack Bot User OAuth Token |
| `SLACK_USER_TOKEN` | No | Slack User OAuth Token (for search) |

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

## MCP Tools

When running `slamy mcp`, the following tools are available:

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
go build -o slamy .
go test ./...
```

## License

MIT

## Links

- [GitHub Repository](https://github.com/tackeyy/slamy)
- [Slack API Documentation](https://api.slack.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
