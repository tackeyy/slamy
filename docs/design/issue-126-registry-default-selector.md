# fix #126: workspace registry の default を selector 解決に使う

## 目的

`slamy workspace default <selector>` で設定した registry の default workspace が、`--workspace` フラグ・`SLAMY_DEFAULT_WORKSPACE` 環境変数のいずれも未指定のコマンド実行で selector として解決されるようにする。現状は legacy 経路（未認証ガイダンス）へ落ちる（Issue #126）。

## スコープ

**やること**:
- `src/cli/api-client.ts` の `createCliApiClient` の selector 未解決時フローに registry default の解決を追加
- 対応するユニットテストの追加（`src/cli/__tests__/api-client.test.ts`）
- `README.md` の workspace selection order の更新

**やらないこと**:
- `src/workspace/registry.ts` の変更（`registry.resolve(undefined)` は既に default 解決に対応済み。これをそのまま使う）
- `resolveCliWorkspaceSelector` の署名変更（sync 関数のまま維持。registry 参照は async のため `createCliApiClient` 側に置く）
- #124 の未認証ガイダンス文言の変更

## 解決順序（確定仕様）

```
1. --workspace <selector>（explicitWorkspace）
2. SLAMY_DEFAULT_WORKSPACE
3. registry の default workspace（今回追加）
4. legacy SLACK_USER_TOKEN / SLACK_BOT_TOKEN
5. どれもなければ未認証ガイダンス（buildAuthGuidanceMessage）
```

registry default は明示操作（`slamy workspace default`）でのみ設定されるため、legacy env token より優先してよい。default 未設定・registry 空の場合は従来どおり 4→5 へ落ちる（後方互換維持）。

## 変更対象ファイルと実装方針

### `src/cli/api-client.ts`

`createCliApiClient` の `selector === undefined` 分岐（現行 L60-79）を変更する:

1. registry インスタンスの生成（`options.registry ?? createWorkspaceRegistry({ env })`）を selector 判定より前に移動する
2. `selector === undefined` の場合、まず `registry.resolve(undefined)` を try する
   - 成功: 解決された workspace で既存の workspace フロー（localSession 確認 → credentialResolver）へ合流する。**再 resolve せず、解決済み `WorkspaceView` を使う**（L82 の `registry.resolve(selector)` と処理を共通化するため、workspace 解決後の処理を関数に切り出すか、フローを再構成してよい）
   - 失敗（`WorkspaceRegistryError` の `DEFAULT_NOT_FOUND` / `WORKSPACE_NOT_FOUND` / registry 読み取り失敗）: 従来の legacy 判定へ進む。**registry 由来の予期しないエラーで legacy へ silent fallback しない**こと。fallback してよいのは「default が未設定 / 解決不能」を示すエラーのみ。それ以外（store 破損等のデコードエラー）はそのまま throw する
3. legacy token も無い場合の未認証ガイダンス（L64-73）は従来どおり

### `src/cli/__tests__/api-client.test.ts`

既存テストのモック様式（`registry` / `credentialResolver` / `clientFactory` の注入）に合わせて追加する。

### `README.md`

- workspace selection order（現行 3 項目のリスト）を 4 項目に更新: `--workspace` → `SLAMY_DEFAULT_WORKSPACE` → registry default → legacy
- `slamy workspace default` コマンド節（L260 付近）に「default を設定すると selector 未指定時に使われる」旨を 1 文追加

## 受け入れ条件（検証可能）

1. registry に default workspace が設定されている状態で、`--workspace`・`SLAMY_DEFAULT_WORKSPACE` とも未指定で `createCliApiClient` を呼ぶと、default workspace の credential で client が生成され `teamId` が設定される
2. registry default 未設定 + legacy token あり → 従来どおり legacy client が生成される（回帰なし）
3. registry default 未設定 + legacy token なし → 従来どおり未認証ガイダンスが throw される（回帰なし）
4. `--workspace` 指定は registry default より優先される
5. `SLAMY_DEFAULT_WORKSPACE` は registry default より優先される
6. registry store の読み取りが「default 未設定」以外の理由で失敗した場合、legacy へ fallback せずエラーが伝播する
7. 既存テストスイートが全件 green
8. README の selection order が 4 項目に更新されている

## テストリスト

- [ ] default 設定済み + selector 未指定 → default workspace で解決される
- [ ] default 設定済み + `--workspace` 指定 → 指定 selector が勝つ
- [ ] default 設定済み + `SLAMY_DEFAULT_WORKSPACE` 設定 → env が勝つ
- [ ] default 未設定 + legacy token → legacy client（既存挙動）
- [ ] default 未設定 + token なし → ガイダンス throw（既存挙動）
- [ ] registry 読み取りが store 破損で失敗 → エラー伝播（legacy へ落ちない）
