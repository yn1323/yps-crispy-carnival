# e2e/AGENTS.md

このファイルは `e2e/` 配下へ適用する。
ルートの `AGENTS.md` と併せて読む。

## 必読

- E2Eを追加・変更する前に `doc/rules/testing-strategy.md` を読む。
- テスト層、配置、新しい検証契約を判断する場合は `test-strategy` を使う。
- 認証、token、通知testing API、外部副作用に触れる場合は `doc/rules/security-strategy.md` を読み、`shiftori-security-review` を使う。
- 実行環境、browser、suite選択、reporterの現在値は `playwright.config.ts` と `.github/workflows/` を正とする。

## 常時制約

- 実ユーザー、実店舗、本番データを使わない。
- 認証状態は既存のsetupとstorage stateを使う。
- テストデータはworkerまたはtestごとに一意にし、並列実行で衝突させない。
- teardownは自分が作成したデータだけを対象にする。
- testing helperやtesting HTTP APIは、E2E専用credentialを検証してから状態を変更する。
- token、credential、メール本文、LINE payload、個人情報をreport、trace、artifact、ログへ出さない。
- 外部サービスの実到着を通常E2Eの成功条件にしない。
- E2Eの構造、selector、待機、通知検証の手順は `test-strategy` に従う。

## 実行

サーバーはユーザーが起動しているため、E2E作業のために新規起動しない。

```bash
pnpm e2e e2e/path/to/file.spec.ts
```

Playwrightやブラウザ起動がsandbox制限で失敗した場合は、コードの失敗と区別する。
