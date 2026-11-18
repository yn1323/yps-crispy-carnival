---
paths:
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - "scripts/**/*.test.ts"
---

# Logic UTとFrontend Unitの書き方

どちらも`pnpm test:logic`で実行する。
テスト層の選び方は `doc/rules/testing-strategy.md` と `test-strategy` を正本とする。

## Logic UT

対象:

- React / Convex / DOM に依存しない純粋ロジック。
- 日付、時刻、タイムゾーンずれ、丸め、ソート、正規化。
- Zod schema、フォーム固有validation、表示変換。

書き方:

- 境界値を厚めに書く。最小、最大、ちょうど境界、境界外を優先する。
- 日本語名の `describe` / `it` で業務意味が分かるようにする。
- 実装の中間変数やprivateな分岐ではなく、公開関数の入出力を検証する。
- 共有schemaは、定義元のLogic UTまたはConvex Function Testで境界値を一度だけ検証する。
- フロントエンド固有の追加制約がある場合だけ、その純粋validationをLogic UTへ置く。

避けること:

- DOM、React hook、Convex接続をLogic UTに持ち込まない。
- ただの型定義、定数、追加ロジックのないschema定義だけを過剰にテストしない。

## Frontend Unit

対象:

- React hook、jsdom、`window`、`document`、`localStorage`に依存する契約。
- Visual Viewport、event listener、cleanup、同期ガード、mutation引数生成。
- DOMを使うsanitizeやtracking helper。

書き方:

- テストファイル名は`*.test.ts`または`*.test.tsx`に統一する。
- jsdomが必要なファイルは、先頭に`// @vitest-environment jsdom`を記述する。
- frontendとbackendの責務を分け、引数生成やsession cacheだけを検証する。
- 認証、認可、IDOR、永続化は対応するConvex Function TestまたはScenario Testで保証する。
- listener登録とcleanup、enabled切り替え、malformed storage、access kindの分離を必要に応じて確認する。
- 遅延queryは、非表示中に`"skip"`または無効状態になり、表示条件を満たした時に正しい引数へ切り替わることを確認する。
- Intersection Observerやidle callbackで開始する処理は、対象callbackを制御して、開始前、開始後、cleanupを別々に確認する。
- Submit系の同期ガードは、hook単体だけでなく代表componentのBehavior Testでも接続を確認する。

避けること:

- ファイル名に`.frontend`など、実行環境を表す独自suffixを追加しない。
- jsdomが必要なテストで、ファイル単位の環境指定を省略しない。
- component全体の表示やユーザー操作をFrontend Unitへ寄せない。
- backendの権限境界をmock mutationの引数確認だけで保証したことにしない。
