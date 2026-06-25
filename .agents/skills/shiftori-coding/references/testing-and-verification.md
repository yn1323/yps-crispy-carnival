# Testing and Verification

正式なテスト方針は `doc/rules/testing-strategy.md` が Source of Truth。
細かい書き方は `test-strategy` を併用する。

## テスト層

| 変更内容 | 主な場所 |
|---|---|
| 日付、時刻、ソート、正規化、schema、表示変換 | Logic UT: `src/**/*.test.ts` |
| UIの代表状態、空/エラー/長文/SP差分 | Storybook Story / VRT |
| 押せる、進める、エラーが出る、確認文言が出る | Storybook play function |
| query/mutation 単体の認証、認可、IDOR、副作用 | Convex Function Test |
| 複数API後の dashboard、通知、集計、スナップショット | Convex Scenario Test |
| 実 frontend + 実 Convex backend + 認証の主要導線 | E2E |

## コマンド

```bash
pnpm lint
pnpm type-check
pnpm test:logic
pnpm test:ui
pnpm test:convex
pnpm test:convex:logic
pnpm test:convex:scenario
pnpm e2e
pnpm vrt
pnpm build
```

変更範囲に応じて選ぶ。
実装後は最低限 `pnpm lint` と `pnpm type-check` を実行する。

## Sandbox 注意点

- `pnpm lint` は `tsx scripts/check-convex-timezone.ts` が IPC pipe を作るため、Codex sandbox で `EPERM` になることがある。Biome が通っていて IPC だけが原因なら、権限付き再実行を検討する。
- `pnpm e2e`、Playwright、ブラウザ起動、ローカルサーバー接続は sandbox で失敗しやすい。実行環境由来の `EPERM`、browser launch failure、listen failure はコード失敗と分ける。
- Vite / Storybook / Convex dev server はユーザーが起動する。新規起動しない。

## セルフレビュー

完了前に確認する。

- 置き場所が route/page/feature/domain/convex の境界に合っているか。
- Submit の短時間連打や backend 側の重複が問題にならないか。
- query が過剰なフィールドを返していないか。
- index / take / paginate / 上限定数なしに大きな table を読んでいないか。
- 永続 shape 変更に migration plan があるか。
- Story / test / Feature Doc が変更後の仕様を表しているか。
- 薄い wrapper、重複、過剰なコメントが残っていないか。
