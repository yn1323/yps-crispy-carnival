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
- 通常シナリオの認証状態は既存のsetupとstorage stateを使う。logout境界は共有storage stateを破壊せず、専用actorで新しいbrowser contextを作る。
- テストデータはworkerまたはtestごとに一意にし、並列実行で衝突させない。
- 通常E2Eはuser 0から2を`parallelIndex`へ固定し、test順序やretryでユーザーをrotateしない。
- logout境界はuser 3から5を`parallelIndex`へ固定し、通常E2Eと同じClerk sessionを共有しない。
- teardownは自分が作成したデータだけを対象にする。
- testing helperやtesting HTTP APIは、E2E専用credentialを検証してから状態を変更する。
- token、credential、メール本文、LINE payload、個人情報をreport、trace、artifact、ログへ出さない。
- 外部サービスの実到着を通常E2Eの成功条件にしない。
- E2Eの構造、selector、待機、通知検証の手順は `test-strategy` に従う。
- core E2Eを削減または統合するときは、件数ではなく契約IDの移管表でレビューし、`doc/rules/testing-strategy.md`のbrowser-only保全条件を満たす。
- 匿名の保護route redirectとlogout後の保護route再アクセスを、coreまたは独立browser smokeで維持する。
- アクセシビリティ専用のE2E smokeやaxe走査は追加しない。この方針をUIのrole、label、accessible nameや通常の操作契約を省く理由にしない。
- feature flagでskipされる契約はカバレッジ済みとみなさず、公開条件のenabled環境で実行する。

## 実行

サーバーはユーザーが起動しているため、E2E作業のために新規起動しない。

```bash
pnpm e2e:ci
pnpm e2e e2e/path/to/file.test.ts --retries=0 --workers=1
pnpm e2e:burn-in
```

`pnpm e2e:ci`はdesktop 8個、mobile 1個のcore契約とresult gateを実行する。
`pnpm e2e:burn-in`は局所E2Eが成功した後に使い、desktopとmobileを直列化したまま、retryなしで各core契約を10回反復する。
各phaseは次のphaseがreportを上書きする前に、contract ID別の反復数、project、初回成功、skip、flakyとartifact privacyを検査する。

管理者設定の代表契約は、Preview Convexへ`FEATURE_MANAGER_INVITATION=enabled`を明示して実行する。
招待先の氏名とメールアドレスを扱うscenarioは、成功・失敗にかかわらずtrace、screenshot、videoを無効にし、メールproviderへの実配送や招待承認を成功条件にしない。

Full RegressionをE2Eへ追加しない。
実ブラウザ境界を持たない契約は、`doc/rules/testing-strategy.md`に従って下位層へ置く。

Playwrightやブラウザ起動がsandbox制限で失敗した場合は、コードの失敗と区別する。
