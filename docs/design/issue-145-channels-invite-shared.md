# Slack Connect 招待コマンド追加設計（#145）

## 目的

`slamy --workspace <ws> channels invite-shared <channel_id> --email <addr>` で、社外の人を Slack Connect でチャンネルへ招待できるようにする。直近の用途は、社外の会計・税務顧問を WedgeAI の private channel へ招待すること。既存の `channels invite` は同じ workspace のメンバーしか招待できない。

## スコープ

- やること: `conversations.inviteShared` を呼ぶ `channels invite-shared` サブコマンド（human / `--json` / `--plain`、`--dry-run`）
- やらないこと
  - ゲスト招待（`admin.users.invite` は Enterprise Grid の admin API）
  - 招待の承認（`conversations.approveSharedInvite`）・取り消し・一覧
  - user ID 指定での招待（`user_ids`）。宛先は email のみ
  - 1 コマンドでの複数宛先招待（Slack が 1 件ずつしか受け付けないため）
  - チャンネル名から ID への解決

## 変更対象ファイル

既存の `channels invite` の構造を踏襲する（`docs/design/channels-invite.md` 参照）。

- `src/slack/method-policy.ts` — operation `invite-shared-to-conversation`（method `conversations.inviteShared`、**bot token**、scope `conversations.connect:write`、pagination none、retry never、workspaceArgument null）
- `src/slack/adapter.ts` — `inviteSharedToConversation(context, { channelId, emails, externalLimited })` を `WorkspaceSlackOperations` に追加
- `src/lib/local-session-channel-operations.ts` と `src/lib/local-session-web-client.ts` の allowlist
- `src/commands/channel-management.ts` — `inviteSharedToChannel`
- `src/lib/channel-management.ts` — `inviteSharedWorkspaceChannel(request)`（ランタイム選択は既存と同一。`operation: "conversations.inviteShared"`、必要な **bot** scope は `conversations.connect:write`）
- `src/cli/channels.ts` — `invite-shared <channel>` の登録
- `src/output/channel-management.ts` — 結果フォーマッタ

## インターフェース

```
slamy --workspace <alias> channels invite-shared <channel_id> --email <addr> [--full-access] [--dry-run] [--json|--plain]
```

- `--email` はちょうど 1 件。Slack の仕様で「1 回に招待できるのは 1 件の email か 1 件の user ID だけ」と明記されているため、複数宛先は受け付けない（複数人を招く場合はコマンドを複数回実行する）
- `external_limited` は既定 `true`（相手側がチャンネルの設定を変えられない）。`--full-access` で `false` を送る
- 入力検査（API を呼ぶ前）: channel ID は `/^[CG][A-Z0-9]+$/`（legacy private channel の `G` 始まりを含む。adapter 側も同じ集合を受ける parser を使う）、email は `local@domain.tld` 形式（空白・カンマを含まない、`@` がちょうど 1 つ、ドメインに `.` を含む）
- 実行時（dry-run でない）は API 呼び出しの前に、stderr へ `workspace alias / Team ID / channel ID / 宛先 email` を 1 行ずつ表示する（外部送信の最終確認として）

結果（JSON）:

```json
{ "status": "planned" | "invited", "teamId": "T…", "workspace": "<alias>", "channelId": "C…", "email": "…", "externalLimited": true, "inviteId": "I…" }
```

- `inviteId` は `invited` のときだけ。API 応答の `url` と `conf_code` は**出力しない**（招待リンクを知っていれば第三者が参加手続きを進められるため）
- API エラーは既存 `invite` と同様に platform code をメッセージにして exit 1（`missing_scope` / `not_paid` / `restricted_action` 等を別経路へ fallback しない）

## 前提

`conversations.inviteShared` は bot token 専用で、必要な scope は bot 側の `conversations.connect:write`（[Slack の method ドキュメント](https://docs.slack.dev/reference/methods/conversations.inviteShared/)）。workspace に bot credential と当該 scope が無い場合、このコマンドは credential 解決の時点で失敗する。別の token へ fallback しない。

## 受け入れ条件

1. `--dry-run` が credential を読まず planned を返す（宛先を含む）
2. 成功時に `invited` と `inviteId` を返し、`url` / `conf_code` を出力しない
3. `--full-access` の有無で `external_limited` が true / false になる
4. email 形式不正・`--email` の 0 件や 2 件以上・channel ID 不正で API を呼ばずに失敗する
5. API エラーが platform code 付きで伝播する
6. local session 経路でも使える
7. 既存テストスイートと `npm run check:architecture` が green

## テストリスト

- cli: 入力検査（email 形式・0 件・2 件以上、`C` と `G` の channel ID、`D` の拒否）、`--full-access`、出力 3 形式、実行前の stderr 表示
- commands: invited / dry-run / API エラー伝播 / url・conf_code を捨てる
- method-policy: operation の scope と method
- local session: inviteShared の呼び出しと allowlist
