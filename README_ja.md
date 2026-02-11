# slamy — Slack MCP サーバー & CLI

[English](README.md)

Slack 用の [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) サーバー兼 CLI ツール。Claude Code や Claude Desktop などの AI エージェントから Slack を操作したり、ターミナルから直接利用できます。

## 機能

- **MCP サーバー** — Slack 操作を MCP ツールとして AI エージェントに公開
- **CLI** — 同じ操作をターミナルから直接実行
- **チャンネル** — チャンネル一覧、メッセージ履歴取得
- **メッセージ** — メッセージ投稿、スレッド返信
- **ユーザー** — ワークスペースメンバー一覧、プロフィール表示
- **リアクション** — 絵文字リアクション追加
- **検索** — Slack クエリ構文でメッセージ横断検索
- **複数出力フォーマット** — テキスト、JSON、TSV

## インストール

```bash
go install github.com/tackeyy/slamy@latest
```

ソースからビルドする場合:

```bash
git clone https://github.com/tackeyy/slamy.git
cd slamy
go build -o slamy .
```

## クイックスタート

### 1. Slack App を作成

1. [Slack API](https://api.slack.com/apps) にアクセスし、**Create New App** をクリック
2. **From scratch** を選択し、アプリ名（例: `slamy`）を入力
3. インストール先のワークスペースを選択

### 2. User Token Scopes を設定

**OAuth & Permissions** > **Scopes** > **User Token Scopes** に以下を追加:

| Scope | 用途 |
|---|---|
| `channels:history` | パブリックチャンネルのメッセージ閲覧 |
| `channels:read` | チャンネル情報の取得 |
| `chat:write` | メッセージ送信（自分として投稿） |
| `groups:history` | プライベートチャンネルのメッセージ閲覧 |
| `groups:read` | プライベートチャンネル情報の取得 |
| `reactions:write` | 絵文字リアクションの追加 |
| `search:read` | メッセージ検索 |
| `users:read` | ユーザー情報の取得 |
| `users:read.email` | メールアドレスの閲覧 |
| `users.profile:read` | ユーザープロフィールの閲覧 |

### 3. インストールと環境変数の設定

ワークスペースにアプリをインストールし、トークンを設定:

```bash
export SLACK_USER_TOKEN=xoxp-your-user-token
```

### 4. 実行

```bash
./slamy channels list
```

## User Token vs Bot Token

Slack App は 2 種類のトークンを発行できます。用途に応じて使い分けます。

| | Bot Token (`xoxb-`) | User Token (`xoxp-`) |
|---|---|---|
| メッセージ検索 (`search:read`) | **利用不可** | 利用可 |
| トークン管理 | 検索が必要なら 2 トークン必要 | 1 トークンで完結 |
| メッセージ投稿 | アプリ名（bot）として投稿 | ユーザー本人として投稿 |
| プライベートチャンネル | bot を招待する必要あり | ユーザーと同じチャンネルにアクセス |

### User Token を使うケース: ユーザーの代理として動作する場合

slamy は **AI 秘書 / パーソナルアシスタント**（Claude Code + MCP）の一部として開発されました。特定のユーザーに代わって Slack の閲覧・検索・投稿を行うユースケースでは、User Token が自然な選択です:

1. **検索に必須** — `search:read` は User Token 専用のスコープ。Bot Token ではメッセージ検索ができない
2. **トークン 1 つで完結** — 2 つのトークンを管理して操作ごとに使い分ける必要がない
3. **ユーザーコンテキスト** — エージェントの投稿がユーザー本人として表示され、誰の操作か明確
4. **チャンネルアクセス** — bot を個別に招待せずとも、ユーザーと同じチャンネルにアクセスできる

### Bot Token を使うケース: bot を作る場合

Slack bot（パーソナルアシスタントではなく）を作る場合は Bot Token が適切です:

- bot 独自のアイデンティティを持ち、アプリ名で投稿する
- 複数ユーザーが bot とやり取りする — 特定ユーザーとして動作すべきでない
- bot を招待したチャンネルだけにアクセスを制限したい
- メッセージ検索が不要、または制約を許容できる

## コマンド

### `channels list` — チャンネル一覧

```bash
slamy channels list [--limit <number>] [--include-archived] [--json] [--plain]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `--limit <number>` | No | 取得するチャンネル数の上限 |
| `--include-archived` | No | アーカイブ済みチャンネルを含める |
| `--json` | No | JSON 形式で出力 |
| `--plain` | No | TSV 形式で出力 |

### `channels history` — チャンネルのメッセージ履歴

```bash
slamy channels history <channel_id> [--limit <number>] [--json] [--plain]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `<channel_id>` | Yes | チャンネル ID |
| `--limit <number>` | No | メッセージ数（デフォルト: 20） |

### `messages post` — メッセージ投稿

```bash
slamy messages post <channel_id> --text <message> [--json] [--plain]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `<channel_id>` | Yes | チャンネル ID |
| `--text <message>` | Yes | メッセージ本文 |

### `messages reply` — スレッド返信

```bash
slamy messages reply <channel_id> <thread_ts> --text <message> [--json] [--plain]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `<channel_id>` | Yes | チャンネル ID |
| `<thread_ts>` | Yes | スレッドのタイムスタンプ |
| `--text <message>` | Yes | 返信本文 |

### `users list` — ユーザー一覧

```bash
slamy users list [--include-deactivated] [--include-bots] [--json] [--plain]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `--include-deactivated` | No | 無効化されたユーザーを含める |
| `--include-bots` | No | bot ユーザーを含める |

### `users profile` — ユーザープロフィール

```bash
slamy users profile <user_id> [--json] [--plain]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `<user_id>` | Yes | ユーザー ID |

### `reactions add` — 絵文字リアクション追加

```bash
slamy reactions add <channel_id> <timestamp> --name <emoji> [--json] [--plain]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `<channel_id>` | Yes | チャンネル ID |
| `<timestamp>` | Yes | メッセージのタイムスタンプ |
| `--name <emoji>` | Yes | 絵文字名（コロンなし） |

### `search messages` — メッセージ検索

```bash
slamy search messages <query> [--count <number>] [--page <number>] [--sort <field>] [--sort-dir <direction>] [--json] [--plain]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `<query>` | Yes | 検索クエリ（`in:#channel`、`from:@user` 等の Slack 修飾子対応） |
| `--count <number>` | No | 1 ページあたりの結果数 |
| `--page <number>` | No | ページ番号 |
| `--sort <field>` | No | ソートフィールド |
| `--sort-dir <direction>` | No | ソート方向 |

### `auth test` — 認証テスト

```bash
slamy auth test [--json] [--plain]
```

### `mcp` — MCP サーバー起動

```bash
slamy mcp
```

stdio 経由の MCP サーバーを起動し、すべての操作を AI エージェント向けツールとして公開します。

## 設定

### 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `SLACK_USER_TOKEN` | Yes | Slack User OAuth Token (`xoxp-...`) |
| `SLACK_TEAM_ID` | No | Slack Team ID（ワークスペース固有の操作用） |

## 出力フォーマット

### テキスト（デフォルト）

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

## MCP サーバー

### Claude Code での利用

```bash
claude mcp add slamy /path/to/slamy mcp
```

### Claude Desktop での利用

`claude_desktop_config.json` に追加:

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

### 利用可能なツール

| ツール | 説明 |
|---|---|
| `slack_list_channels` | チャンネル一覧 |
| `slack_get_channel_history` | チャンネルのメッセージ履歴取得 |
| `slack_get_thread_replies` | スレッド返信の取得 |
| `slack_post_message` | チャンネルにメッセージ投稿 |
| `slack_reply_to_thread` | スレッドに返信 |
| `slack_add_reaction` | 絵文字リアクション追加 |
| `slack_get_users` | ユーザー一覧 |
| `slack_get_user_profile` | ユーザープロフィール取得 |
| `slack_search_messages` | メッセージ検索 |

## 開発

```bash
go build -o slamy .
go test ./...
```

## ライセンス

MIT

## リンク

- [GitHub リポジトリ](https://github.com/tackeyy/slamy)
- [Slack API ドキュメント](https://api.slack.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
