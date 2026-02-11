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

```bash
go install github.com/tackeyy/slamy@latest
```

Or build from source:

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
| `SLACK_USER_TOKEN` | Yes | Slack User OAuth Token (`xoxp-...`) |
| `SLACK_TEAM_ID` | No | Slack Team ID (for workspace-specific operations) |

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
go build -o slamy .
go test ./...
```

## License

MIT

## Links

- [GitHub Repository](https://github.com/tackeyy/slamy)
- [Slack API Documentation](https://api.slack.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
