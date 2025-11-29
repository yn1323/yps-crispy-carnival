# E2Eテストの修正

## ゴール
失敗しているE2Eテストを修正し、アプリケーションが正しく動作することを確認する。

## ユーザーレビューが必要な事項
現時点では特になし。

## 変更案
### E2Eテスト
#### [MODIFY] [list.test.ts](file:///c:/Users/yn132/work/yps-crispy-carnival/e2e/scenarios/shop/list.test.ts)
- ページタイトルのセレクタをより具体的にすることで、Strict Mode違反を修正します。
- `page.getByText("店舗一覧")` を `page.getByRole("heading", { name: "店舗一覧" })` に変更します。

#### [MODIFY] [new-owner.test.ts](file:///c:/Users/yn132/work/yps-crispy-carnival/e2e/scenarios/userB/new-owner.test.ts)
- 「所属する店舗がありません」が表示されない原因を調査します。
- 既存データが原因の場合は、クリーンアップ処理またはロバストなチェックを実装します。
- 現状では、ユーザーが店舗を持っているかどうかを確認するために、店舗リスト要素の有無をチェックするように修正することを検討します。

## 検証計画
### 自動テスト
- `pnpm e2e` を実行して修正を確認します。
- 特に `pnpm playwright test e2e/scenarios/shop/list.test.ts` を実行して最初の修正を確認します。
- `pnpm playwright test e2e/scenarios/userB/new-owner.test.ts` を実行して2つ目の問題をデバッグ・確認します。
