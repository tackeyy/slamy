# fix #132: threads replies search フォールバックの channel 絞り込みをメンション記法に統一する

## 目的

`getThreadRepliesViaSearch` の `in:` クエリ構築を、`resolveChannelName` による名前解決 + ID フォールバックから、**channel メンション記法 `in:<#CHANNEL_ID>` の単一経路**へ置き換える。これにより #132 の 3 項目（ID フォールバックの挙動未確認 / 非例外 fallback 経路のテスト未到達 / 到達不能な catch）をまとめて解消する。

## 一次確認の結果（実 workspace・2026-08-12 実測）

`search.messages` に各記法を渡して比較した（public × 2、private × 1）。

| クエリ記法 | 結果 |
|---|---|
| `in:<channel_name>` | 正しく絞り込まれる（例: total 5 / 95 / 2、全 match が対象 channel） |
| `in:#<channel_name>` | 同上 |
| `in:<#CHANNEL_ID>`（メンション記法） | **正しく絞り込まれる。名前解決なしで channel ID がそのまま使える**（名前記法と total 完全一致: 5/5, 95/95, 2/2） |
| `in:CHANNEL_ID`（裸の ID） | **total 0。マッチゼロで返る** |

重要な含意:

- 現行の ID フォールバックは「絞り込みが効かず遅くなる」のではなく、**マッチゼロで静かに空スレッドを返すバグ**である（利用者にはエラーではなく「返信なし」に見える）。#132 の項目 1 は「性能懸念」ではなく「正確性の不具合」として確定した
- メンション記法は channel ID で機能するため、名前解決そのものが不要になる

## スコープ

**やること**:
- `src/lib/client.ts` の `getThreadRepliesViaSearch` で `in:` クエリを `in:<#${resolvedChannel}>` に変更し、`resolveChannelName` 呼び出しと名前解決 fallback ブロック（try/catch + else 警告）を削除する
- 対応するテストの更新・追加（`src/lib/__tests__/client.test.ts`）

**やらないこと**:
- `resolveChannelName` 自体の変更・削除（他の呼び出し元がある）
- `isExactThreadSearchMatch` の判定ロジック変更（channel ID 完全一致の再検証は引き続き必須。クエリ側の絞り込みを信頼しない多層防御として維持する）
- `THREAD_SEARCH_MAX_PAGES` ガードの変更
- `src/cli/index.ts` の変更（stdout の JSON/human 出力契約は不変）
- `search messages` コマンド自体や他の `in:` 利用箇所の変更

## 実装方針

`src/lib/client.ts` の `getThreadRepliesViaSearch` 冒頭（現行 L875-892 付近）:

```
変更前: resolveChannelName で名前解決 → 成功なら in:<name>、失敗なら in:<ID> + stderr 警告（try/catch あり）
変更後: channelQuery = `<#${resolvedChannel}>` の 1 行。名前解決・fallback・警告・try/catch をすべて削除
```

- `resolveChannelName` の呼び出しが消えることで `conversations.list`（最大 1000 件 × ページネーション）の API コールが不要になる副次効果がある
- 名前解決失敗時の stderr 警告は、そもそも失敗経路自体が消えるため削除する。フォールバック利用そのものを示す既存の警告（`missing_scope` 検出時のもの）は**維持する**

## 受け入れ条件（検証可能）

1. `missing_scope` フォールバック時、`search.messages` が `query: "in:<#CHANNEL_ID>"` の形式で呼ばれる（channel 名でも裸の ID でもない）
2. `resolveChannelName` が呼ばれない（`conversations.list` / `conversations.info` が発火しない）ことをモックで確認できる
3. 名前解決失敗を模した stderr 警告（`channel name resolution failed`）が出力されない（当該コードが存在しない）
4. `conversations.replies` 成功経路に回帰がない
5. `missing_scope` 以外のエラーは従来どおり伝播する
6. channel_id / thread_ts の完全一致フィルタ、ts 欠落 match の fail-closed 除外、ts 昇順整列、`--limit` 適用、`THREAD_SEARCH_MAX_PAGES` ガードはいずれも従来どおり機能する
7. 診断エラーの secret 非露出が維持される
8. 既存テストスイートが全件 green（型チェック含む）

## テストリスト

- [ ] フォールバック時のクエリが `in:<#C...>` 形式である
- [ ] フォールバック時に `conversations.list` / `conversations.info` が呼ばれない
- [ ] `channel name resolution failed` 警告が発生しない
- [ ] `conversations.replies` 成功経路の回帰なし（既存テスト維持）
- [ ] `missing_scope` 以外のエラー伝播（既存テスト維持）
- [ ] 完全一致フィルタ・ts 欠落除外・昇順・limit・max_pages（既存テスト維持。削除・弱体化しないこと）
- [ ] 名前解決に関する既存テスト（例外時 fallback 等）は、対象コードの削除に伴い削除または置き換える
