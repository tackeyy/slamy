# Issue #104 workspace-awareチャンネル管理 実装記録

## 結論

明示workspaceのUser Tokenでpublic/private channelを作成し、topicとpurposeを設定・再取得できる
`channels create`コマンドを追加した。同名チャンネルは再利用するため、再実行で重複作成しない。

## 安全境界

- `--workspace`、`--topic`、`--purpose`を必須とする。
- `--dry-run`ではcredential resolverとSlack APIを呼ばない。
- credentialのTeam IDと対象workspaceのTeam IDが異なる場合は書き込み前に停止する。
- 作成前にpublic/private channelを確認し、同名かつ公開範囲が異なる場合は停止する。
- 作成または再利用後にpurpose、topicの順で設定し、`conversations.info`で最終状態を照合する。
- 部分失敗時はtokenやraw SDK errorを保持せず、channel ID、作成済みか、失敗段階だけを返す。
- archive、削除、メンバー招待、汎用Web API passthroughは対象外とする。

## Slack操作policy

| 操作 | Slack method | User scope |
|---|---|---|
| public一覧 | `conversations.list` | `channels:read` |
| private一覧 | `conversations.list` | `groups:read` |
| public作成 | `conversations.create` | `channels:write` |
| private作成 | `conversations.create` | `groups:write` |
| public topic・purpose | `conversations.setTopic` / `conversations.setPurpose` | `channels:write.topic` |
| private topic・purpose | `conversations.setTopic` / `conversations.setPurpose` | `groups:write.topic` |
| public再取得 | `conversations.info` | `channels:read` |
| private再取得 | `conversations.info` | `groups:read` |

## WedgeAI dogfood

Team ID `T0BJ9SG2M0R`を明示し、11チャンネルを作成した。`00-general`から`08-random`はpublic、
`10-finance`と`11-board`はprivateとした。各操作は作成後のtopic・purpose再取得照合に成功した。
token値は実行ログ、Git、registryへ保存していない。

## 検証

対象テスト、typecheck、build、architecture check、Markdown lint、全test、coverage、package consumerを
最終HEADへ実行し、PRのCI結果と合わせて記録する。
