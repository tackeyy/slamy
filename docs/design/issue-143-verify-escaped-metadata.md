# channels create の verify を Slack のエスケープに合わせる（#143）

## 目的

`channels create` は設定後に `conversations.info` を読み直し、name / private / topic / purpose を入力と文字列比較する。purpose に `&` を含めると、作成・設定は完了しているのに `Slack channel verify failed after the channel target was resolved` で失敗する（2026-09-18 JST、WedgeAI で観測・再実行でも再現）。

原因は未確認で、候補は次の 2 つ。現状の実装はどちらでも同じメッセージを出すため区別できない。

1. Slack が topic / purpose の値を `&amp;` `&lt;` `&gt;` にエスケープして返し、比較が一致しない
2. `conversations.info` の取得自体が失敗している（例外を同じ `verify` で包んでいる）

## スコープ

- やること
  - 照合の前に、取得した topic / purpose から Slack のエスケープ 3 種（`&amp;` → `&`、`&lt;` → `<`、`&gt;` → `>`）を復元してから比較する
  - verify 失敗を「取得に失敗した」と「値が一致しなかった」に分け、後者では一致しなかった**項目名**（`name` / `isPrivate` / `topic` / `purpose`）をエラーに含める。**値そのものは出さない**
- やらないこと
  - 上記 3 種以外の HTML 実体参照（`&quot;` `&#39;` など）の復元
  - 入力側（setPurpose / setTopic へ渡す値）のエスケープ
  - `channels create` 以外のコマンドの変更

## 変更対象ファイル

- `src/commands/channel-management.ts` — `configureAndVerify` の照合と `ChannelEnsureError`
- 対応するテスト（`src/commands/__tests__/channel-management.test.ts` など）

## インターフェース

- `ChannelEnsureError.stage` を `"configure" | "verify-fetch" | "verify-mismatch"` にする。`verify-mismatch` の場合は `mismatchedFields: readonly ("name" | "isPrivate" | "topic" | "purpose")[]` を持つ
- メッセージ:
  - `Slack channel configure failed after the channel target was resolved`（従来どおり）
  - `Slack channel verify failed after the channel target was resolved: could not read the channel`
  - `Slack channel verify failed after the channel target was resolved: mismatched purpose`（複数なら `, ` 区切り）
- 復元は照合専用。戻り値や出力の topic / purpose は従来どおり入力値

## 受け入れ条件

1. Slack が `&amp;` `&lt;` `&gt;` を含む値を返しても、入力の `&` `<` `>` と一致すれば成功する
2. 復元後も値が異なる場合は `verify-mismatch` で失敗し、該当する項目名だけを含む
3. 二重エスケープ（`&amp;amp;`）を 1 段だけ復元し、入力 `&amp;` と一致する。入力 `&` とは一致しない
4. `conversations.info` が失敗したら `verify-fetch` で失敗する
5. 既存テストが green

## テストリスト

- 3 種それぞれのエスケープを含む purpose / topic で成功
- 値が違う場合は項目名つきで失敗（topic のみ・purpose のみ・複数）
- name / isPrivate の不一致も従来どおり失敗
- 二重エスケープの扱い
- 取得失敗は `verify-fetch`
