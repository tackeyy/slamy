# slamy — Slack API クライアント & CLI

[English](README.md) | **日本語**

Slack の閲覧・検索・投稿に対応する Slack API クライアント兼 CLI ツールです。

## 機能

- **CLI** — Slack 操作をターミナルから直接実行
- **TypeScript API クライアント** — Node.js アプリケーションから `SlamyClient` を利用
- **Socket Mode イベント** — `SlamyEvents` で Slack イベントを購読
- **チャンネル** — チャンネル一覧、メッセージ履歴取得
- **メッセージ** — メッセージ投稿、スレッド返信
- **ユーザー** — ワークスペースメンバー一覧、プロフィール表示
- **リアクション** — 絵文字リアクション追加
- **検索** — Slack クエリ構文でメッセージ横断検索
- **複数出力フォーマット** — テキスト、JSON、TSV

## インストール

### npm（TypeScript API / CLI）

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

### ソースから Go CLI をビルド

```bash
git clone https://github.com/tackeyy/slamy.git
cd slamy/go-src
go build -o ../slamy .
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
| `team:read` | ワークスペース（team）情報の取得 |

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

slamy は、特定のユーザーに代わって Slack の閲覧・検索・投稿を行うアプリケーションをサポートします。このユースケースでは、User Token が自然な選択です:

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

slamy には Go 版と TypeScript 版の CLI があります。利用できるルートオプションは、インストールした CLI によって異なります。

Go CLI（`go install` またはソースからビルド）:

| フラグ | 説明 |
|---|---|
| `--workspace <alias>` | この実行で使用する Slack ワークスペースエイリアスを指定 |
| `--json` | JSON 形式で出力 |
| `--plain` | TSV 形式で出力 |

TypeScript CLI（`npm install`）:

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

### `channels members` — チャンネルメンバー一覧

```bash
slamy channels members <channel_or_url> [--resolve-names]
```

`<channel_or_url>` は channel ID または Slack permalink URL を受け付けます。`--resolve-names` で `user_id` を実名表示。

### `users list` / `users profile`

```bash
slamy users list [--include-deactivated] [--include-bots]
slamy users profile <user_id>
```

### `assistant set-status` — AI Assistant スレッドのステータス設定

```bash
slamy assistant set-status --channel <id> --thread <ts> --status <text> [--loading-message <text...>]
```

AI Assistant スレッドの typing indicator を設定します。CI/シェルスクリプト用には `--plain` で機械可読 TSV (`ok\t<channel>\t<thread>`) が利用できます。

### `reactions get` — 特定メッセージの reactions を取得

```bash
slamy reactions get <channel_or_url> [timestamp] [--resolve-names]
```

絵文字ごとの reaction 数と reaction したユーザーを返します。`reactions add` 前に既存リアクションを確認するのに便利です。

### `reactions list` — ユーザーの reaction 履歴

```bash
slamy reactions list [--user <user_id>] [--limit <n>] [--count] [--resolve-names]
```

`--resolve-names` は `channel_id` を channel 名に解決します (`#C0123ABCDE` ではなく `#general`)。

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

### `team info` — ワークスペース情報の取得

```bash
slamy team info [--json] [--plain]
```

ワークスペースのドメイン・`email_domain`・Enterprise 情報を返す。`email_domain` は SSO のドメイン不一致の診断に役立つ。`team:read` スコープが必要。なお、SSO の必須化設定は Slack API では取得**できない**。

## 設定

### 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `SLAMY_WORKSPACE_<ALIAS>_USER_TOKEN` | 対応するエイリアスの選択時 | ワークスペースエイリアス用の User OAuth Token。エイリアスを大文字化し、ハイフンをアンダースコアへ変換 |
| `SLAMY_DEFAULT_WORKSPACE` | No | `--workspace` を省略した場合に使用するワークスペースエイリアス |
| `SLACK_USER_TOKEN` | 従来の単一ワークスペース利用時 | 後方互換用 Slack User OAuth Token (`xoxp-...`)。明示・デフォルトのどちらのエイリアスも選択されない場合のみ使用 |
| `SLACK_BOT_TOKEN` | いずれか | Slack Bot OAuth Token (`xoxb-...`) — 書き込み操作と `reactions get` で使用 |
| `SLAMY_TZ` | No | `engagement` コマンド用の IANA タイムゾーン（デフォルト: `Asia/Tokyo`） |
| `SLACK_TEAM_ID` | No | Slack Team ID（ワークスペース固有の操作用） |

従来モードで `SLACK_USER_TOKEN` / `SLACK_BOT_TOKEN` の両方を設定すると、操作に応じて適切なトークンが自動選択されます。

### 複数ワークスペース

ワークスペースエイリアスはローカルの識別子です。Slack 上のワークスペース名、ドメイン、Team ID とは独立しており、slamy がエイリアスを自動検出・照合することはありません。エイリアスは 1〜63 文字で、正規表現 `^[a-z0-9]+(?:-[a-z0-9]+)*$` に一致する必要があります（例: `primary`、`operations`、`project-a`）。

エイリアスごとに User OAuth Token を設定します。環境変数名は、エイリアスを大文字化し、ハイフンをアンダースコアへ変換して作成します。

```bash
export SLAMY_DEFAULT_WORKSPACE=primary
export SLAMY_WORKSPACE_PRIMARY_USER_TOKEN='<user-token>'
export SLAMY_WORKSPACE_OPERATIONS_USER_TOKEN='<user-token>'
export SLAMY_WORKSPACE_PROJECT_A_USER_TOKEN='<user-token>'
```

接続先は次の順序で選択されます。

1. ルートの persistent flag `--workspace <alias>`
2. `SLAMY_DEFAULT_WORKSPACE`
3. 上記 2 つがどちらも未設定の場合のみ、後方互換用の `SLACK_USER_TOKEN`

選択用の `SLAMY_WORKSPACE` 環境変数はありません。明示指定には `--workspace` を使用してください。

```bash
# デフォルトエイリアス primary を使用
slamy channels list

# 明示指定はデフォルトより優先
slamy --workspace operations channels list
slamy --workspace project-a auth test
```

エイリアス選択は fail-closed です。`--workspace` または `SLAMY_DEFAULT_WORKSPACE` で選択したエイリアスに対応する `SLAMY_WORKSPACE_<ALIAS>_USER_TOKEN` が未設定の場合、`SLACK_USER_TOKEN` や別エイリアスへフォールバックせずエラーを返します。

既存の単一ワークスペース設定には後方互換性があります。`SLACK_USER_TOKEN` をそのまま設定し、`--workspace` と `SLAMY_DEFAULT_WORKSPACE` の両方を未設定にしてください。移行するには、既存トークンをエイリアス用環境変数へ移し、`SLAMY_DEFAULT_WORKSPACE` にそのエイリアスを設定します。新しい設定を確認した後で `SLACK_USER_TOKEN` を削除してください。

すべてのトークンを secret として扱ってください。リポジトリへコミットしたり、コマンドライン引数で渡したり、ログ・標準出力・標準エラー出力・JSON へ出力したりしないでください。保護された環境変数または secret 管理機能から渡してください。

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

## TypeScript API

npm パッケージは、Slack Web API 操作用の `SlamyClient` と Socket Mode イベント用の `SlamyEvents` を公開しています。Node.js 25 以上が必要です。

```ts
import { SlamyClient } from "slamy";

const client = new SlamyClient({ userToken: process.env.SLACK_USER_TOKEN });
const channels = await client.listChannels();
```

トークンは保護された環境変数またはシークレット管理機能から渡してください。完全な API は公開されている TypeScript の型定義を参照してください。

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
