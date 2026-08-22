# channels invite コマンド追加設計

## 目的

`slamy channels invite <channel> <user...>` で、指定チャンネルへユーザー（bot 含む）を招待できるようにする。直近の用途は、新設した通知フィードチャンネルへ bot ユーザーを CLI から招待すること。

## スコープ

- やること: `conversations.invite` API を呼ぶ `channels invite` サブコマンドの追加（human / `--json` / `--plain` 出力、`--dry-run` 対応）
- やらないこと: kick / leave / join 系の追加、channel 名→ID の解決（引数は channel ID のみ受け付ける。`C` 始まりでない場合はエラー）、複数 workspace 一括操作

## 変更対象ファイル

既存の `channels create`（ensureChannel 系）の構造を踏襲する。

- `src/commands/channel-management.ts` — `inviteToChannel` コマンドロジックを追加（`WorkspaceSlackOperations` に依存）
- `src/slack/`（`WorkspaceSlackOperations` の定義元）— `inviteToConversation(context, { channelId, userIds })` 操作を追加。Web API 実装は `conversations.invite` を呼ぶ
- `src/lib/local-session-channel-operations.ts` — local session 経由の `conversations.invite` 呼び出しを追加
- `src/lib/channel-management.ts` — `inviteWorkspaceChannelUsers(request)` を追加（workspace 解決 → local session / credential resolver のランタイム選択は `ensureWorkspaceChannel` と同一パターン。`operation: "conversations.invite"`、必要 user scope は `channels:write`（private 対応は `groups:write` を併記））
- `src/cli/channels.ts` — `invite <channel> <user...>` サブコマンド登録（バリデーション: channel は `/^C[A-Z0-9]+$/`、user は `/^[UW][A-Z0-9]+$/`）
- `src/output/channel-management.ts` — 結果フォーマッタ追加

## インターフェース

```
slamy --workspace <alias> channels invite <channel_id> <user_id...> [--dry-run] [--json|--plain]
```

結果（JSON）:

```json
{ "status": "invited" | "planned" | "already_in_channel", "channelId": "C…", "invited": ["U…"], "alreadyInChannel": ["U…"] }
```

- `already_in_channel`: Slack が `already_in_channel` エラーを返したユーザーは失敗扱いにせず結果に分類する（冪等）。全員が既参加なら status は `already_in_channel`
- その他の API エラー（`channel_not_found` / `user_not_found` / `not_in_channel` 等）はエラーメッセージにエラーコードを含めて exit 1

## 受け入れ条件

1. `slamy --workspace wedgeai channels invite C… U… --dry-run` が credential を読まずに planned 出力を返す
2. モック Slack ops に対し、invite 成功で `status: "invited"`・invited 一覧が返る
3. `already_in_channel` エラーが冪等に処理される（exit 0）
4. channel/user ID の形式不正で API を呼ばずにエラー終了する
5. 既存テストスイートが green

## テストリスト（TDD）

- cli/channels invite: 引数バリデーション（不正 channel ID / 不正 user ID / user 0 件）
- commands/channel-management: invite 成功 / already_in_channel 混在 / API エラー伝播 / dry-run
- output: human / json / plain の 3 形式
