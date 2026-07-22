# Issue #92 workspace-aware Slack adapter 実装記録

## 結論

TypeScript libraryへ、Slack Team IDと検証済みcredential setを必須とする名前付きSlack操作を追加した。
package rootには汎用Web API passthroughを公開せず、Slack公式CLIの`slack api`と競合しない。
既存CLIと`SlamyClient`は互換経路を維持し、#89・#91で操作単位に新しい境界へ移行する。

## 実装境界

- `slack/adapter.ts`: 明示workspace context、入力・response変換、typed error、diagnostics
- `slack/method-policy.ts`: 操作ごとのmethod、credential種別、scope宣言、pagination方式
- `slack/web-api-transport.ts`: `@slack/web-api`を利用する唯一の新アーキテクチャ内transport
- `slack/pagination.ts`: cursorだけを根拠に継続する上限付きpagination primitive
- `lib/slack.ts`: package root向けのproduction composition
- `lib/index.ts`: slamy所有の名前付き操作・DTO・errorだけを公開

Slack SDK clientは呼び出しごとに生成し、tokenをcacheしない。SDKの自動retryを無効化し、rate limitの
`retryAfter`を`SlackAdapterError.retryAfterSeconds`として上位へ返す。diagnosticsへtoken、引数、raw response、
SDK errorを含めない。request IDはslamyが生成するlocal correlation IDで、Slack response header由来ではない。

## 操作policy

| slamy操作 | Slack method | credential | 宣言scope | pagination |
|---|---|---|---|---|
| `verifyWorkspace(context, "user")` | `auth.test` | User | なし | なし |
| `verifyWorkspace(context, "bot")` | `auth.test` | Bot | なし | なし |
| `getTeamInfo` | `team.info` | User | `team:read` | なし |
| `listPublicConversations` | `conversations.list` | User | `channels:read` | cursor |
| `searchMessages` | `search.messages` | User | `search:read` | なし |
| `postMessage` | `chat.postMessage` | Bot | `chat:write` | なし |

scopeはcredential resolverへ渡した要求の宣言値であり、Slackが実際に付与したscopeの証明ではない。
Slackの`missing_scope`はplatform errorとして正規化する。

## fail-closed条件

- context Team IDとcredential set/User/Bot Team IDの不一致
- 操作policyとcredential種別・scope宣言の不一致
- 不明なruntime credential kind
- verification hookによるworkspace拒否
- Slack responseのTeam ID不一致、未知field型、不正ID・timestamp
- 空白、不正文字、反復、または上限超過のcursor
- hostile getter、SDK error、diagnostic sink errorに含まれるraw値

## 互換性と後続作業

`SlamyClient`のconstructorと既存methodはv2互換facadeとして残す。Issue #92では暗黙に新adapterへ接続せず、
Issue #89・#91でCLIとlibraryを同じcommand use caseへ一つずつ移行する。全移行とdistribution切替が完了するまで、
Go実装と旧TypeScript経路は削除しない。

## 検証記録

最終HEADに対して、typecheck、build、architecture check、Markdown lint、全test、coverage、package consumer
compile、GitHub Actions Qualityを実行する。Mission独立レビューのfindingと最終scoreはPRへ記録する。
