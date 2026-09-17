# channels rename コマンド追加設計（#144）

## 目的

`slamy --workspace <ws> channels rename <channel_id> <new_name>` でチャンネル名を変更できるようにする。直近の用途は、WedgeAI のチャンネル番号を 3 桁体系へ移行する rename（wedgeai-inc/handbook#42）。

## スコープ

- やること: `conversations.rename` を呼ぶ `channels rename` サブコマンド（human / `--json` / `--plain`、`--dry-run`）
- やらないこと: 複数チャンネルの一括 rename、チャンネル名から ID への解決（引数は channel ID のみ）、archive / 削除

## 変更対象ファイル

既存の `channels create` / `channels invite` の構造を踏襲する（`docs/design/channels-invite.md` 参照）。

- `src/slack/method-policy.ts` — operation `rename-public-conversation` / `rename-private-conversation`（method `conversations.rename`、user token、scope はそれぞれ `channels:write` / `groups:write`、pagination none、retry never、workspaceArgument null）
- `src/slack/adapter.ts` — `renameConversation(context, { channelId, name, isPrivate })` を `WorkspaceSlackOperations` に追加
- `src/lib/local-session-channel-operations.ts` と `src/lib/local-session-web-client.ts` の allowlist — local session 経由の `conversations.rename`
- `src/commands/channel-management.ts` — `renameChannel` コマンドロジック
- `src/lib/channel-management.ts` — `renameWorkspaceChannel(request)`（workspace 解決とランタイム選択は既存 2 関数と同一パターン。`operation: "conversations.rename"`。必要 user scope は `channels:read` `groups:read` `channels:write` `groups:write`。private かどうかは実行前に分からないため両方を要求する）
- `src/cli/channels.ts` — `rename <channel> <name>` の登録
- `src/output/channel-management.ts` — 結果フォーマッタ

## インターフェース

```
slamy --workspace <alias> channels rename <channel_id> <new_name> [--dry-run] [--json|--plain]
```

入力検査（API を呼ぶ前）:

- channel ID は `invite` と同じ `/^C[A-Z0-9]+$/`
- new_name は `create` と同じ `/^[a-z0-9][a-z0-9_-]{0,79}$/`

処理順（dry-run 以外）:

1. public / private の全チャンネル（archived を含む）を取得する
2. channel ID が一覧に無ければ失敗（`Channel not found in the selected workspace`）
3. 現在名が new_name と同じなら API を呼ばず `unchanged`
4. 別のチャンネル（archived を含む）が new_name を使っていれば失敗（`Another channel already uses the requested name`）
5. 一覧で判明した private / public に応じた operation で `conversations.rename` を呼ぶ
6. `conversations.info` で読み直し、name が new_name と一致しなければ失敗（取得失敗と不一致を区別したメッセージにする）

結果（JSON）:

```json
{ "status": "planned" | "renamed" | "unchanged", "channelId": "C…", "name": "<new>", "previousName": "<old>" }
```

- `planned` では `previousName` を持たない（credential も Slack も読まない）
- API エラーは既存 `invite` と同様に platform code をメッセージにして exit 1

## 受け入れ条件

1. `--dry-run` が credential を読まず planned を返す
2. 成功時に `renamed` と previousName / name を返し、読み直した name を照合している
3. 同名なら API を呼ばず `unchanged`
4. 他チャンネル（archived 含む）との重複、一覧に無い ID、読み直し不一致がそれぞれ失敗する
5. private チャンネルでは private 用 operation、public では public 用 operation が使われる
6. 入力形式不正で API を呼ばずに失敗する
7. local session 経路でも rename できる
8. 既存テストスイートと `npm run check:architecture` が green

## テストリスト

- cli: 入力検査（ID・名前）、workspace 未指定、出力 3 形式
- commands: renamed / unchanged / 重複 / 未発見 / 読み直し失敗・不一致 / API エラー伝播 / dry-run / public・private の operation 選択
- method-policy: 追加 operation の scope と method
- local session: rename の呼び出しと allowlist
