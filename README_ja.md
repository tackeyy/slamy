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

### Homebrew

```bash
brew install tackeyy/tap/slamy
```

### Go

```bash
go install github.com/tackeyy/slamy@latest
```

### ソースからビルド

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
| `files:read` | チャンネル内で共有されたファイルのダウンロード |
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

### グローバルオプション

すべてのコマンドで利用可能:

| フラグ | 説明 |
|---|---|
| `--json` | JSON 形式で出力 |
| `--plain` | TSV 形式で出力 |
| `--utc` | タイムスタンプを UTC で表示（デフォルトはローカル TZ） |
| `--tz <iana>` | 指定 IANA タイムゾーンで表示（例: `Asia/Tokyo`） |

### `channels history` — チャンネルのメッセージ履歴

```bash
slamy channels history <channel_or_url> [--limit <n>] [--oldest <ts>] [--latest <ts>] [--resolve-names]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `<channel_or_url>` | Yes | チャンネル ID または Slack permalink URL |
| `--limit <n>` | No | メッセージ数（デフォルト: 20） |
| `--oldest <ts>` | No | この Unix timestamp 以降のメッセージのみ |
| `--latest <ts>` | No | この Unix timestamp 以前のメッセージのみ |
| `--resolve-names` | No | `user_id` / `bot_id` を実名表示 |

### `messages post` — メッセージ投稿

```bash
slamy messages post <channel_id> --text <message>
```

### `messages reply` — スレッド返信

```bash
slamy messages reply <channel_or_url> [thread_ts] --text <message> [--broadcast]
```

`<channel_or_url>` は「channel ID + thread_ts」または Slack permalink URL の 1 引数のいずれも受け付けます。

### `messages update` / `messages delete` — メッセージ編集

```bash
slamy messages update <channel_or_url> [ts] --text <new_text>
slamy messages delete <channel_or_url> [ts]
```

### `messages schedule` — 予約投稿

```bash
slamy messages schedule <channel_id> --text <message> --at <datetime>
```

`<datetime>` は Unix timestamp または ISO 8601 形式（例: `2026-02-24T09:00+09:00`）。

### `threads replies` — スレッド返信を取得

```bash
slamy threads replies <channel_or_url> [thread_ts] [--limit <n>] [--resolve-names]
```

`<channel_or_url>` は「channel ID + thread_ts」または Slack permalink URL の 1 引数のいずれも受け付けます。

### `users list` / `users profile`

```bash
slamy users list [--include-deactivated] [--include-bots]
slamy users profile <user_id>
```

### `reactions get` — 特定メッセージの reactions を取得

```bash
slamy reactions get <channel_or_url> [timestamp] [--resolve-names]
```

絵文字ごとの reaction 数と reaction したユーザーを返します。`reactions add` 前に既存リアクションを確認するのに便利です。

### `reactions list` — ユーザーの reaction 履歴

```bash
slamy reactions list [--user <user_id>] [--limit <n>] [--count]
```

注意: `reactions list`（ユーザーの reaction 履歴）と `reactions get`（メッセージへの reactions）は別の API です。

### `reactions add` / `reactions remove` — リアクション追加/削除

```bash
slamy reactions add <channel_or_url> [timestamp] --name <emoji>
slamy reactions remove <channel_or_url> [timestamp] --name <emoji>
```

### `search messages` — メッセージ検索

```bash
slamy search messages <query> [--count <n>] [--page <n>] [--sort <field>] [--sort-dir <dir>] [--resolve-names]
```

| フラグ | 必須 | 説明 |
|---|---|---|
| `<query>` | Yes | 検索クエリ（`in:#channel`、`from:@user` 等の Slack 修飾子対応） |
| `--count <n>` | No | 1 ページあたりの結果数（デフォルト: 20） |
| `--page <n>` | No | ページ番号（デフォルト: 1） |
| `--sort <field>` | No | `timestamp` または `score`（デフォルト: timestamp） |
| `--sort-dir <dir>` | No | `asc` または `desc`（デフォルト: desc） |
| `--resolve-names` | No | `user_id` を実名表示 |

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
| `SLACK_USER_TOKEN` | いずれか | Slack User OAuth Token (`xoxp-...`) — `search messages` や読み取り操作で必要 |
| `SLACK_BOT_TOKEN` | いずれか | Slack Bot OAuth Token (`xoxb-...`) — 書き込み操作と `reactions get` で使用 |
| `SLAMY_TZ` | No | `engagement` コマンド用の IANA タイムゾーン（デフォルト: `Asia/Tokyo`） |
| `SLACK_TEAM_ID` | No | Slack Team ID（ワークスペース固有の操作用） |

`SLACK_USER_TOKEN` / `SLACK_BOT_TOKEN` のいずれかを必ず設定してください。両方設定すると、操作に応じて適切なトークンが自動選択されます。

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
# ビルド
go build -o slamy .

# レースディテクタ付きでテスト実行
go test -race ./...

# カバレッジ付きでテスト実行
go test -cover ./...
```

開発環境のセットアップやコーディング規約は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
テストの詳細ガイドは [docs/TESTING.md](docs/TESTING.md) を参照してください。

## コントリビューション

コントリビューション歓迎です！Pull Request を送る前に [Contributing Guide](CONTRIBUTING.md) をお読みください。

すべてのコントリビューターに [行動規範](CODE_OF_CONDUCT.md) の遵守をお願いしています。

## ライセンス

MIT

## リンク

- [GitHub リポジトリ](https://github.com/tackeyy/slamy)
- [Slack API ドキュメント](https://api.slack.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io/)
