# 分析KPI可視化アプリ

`convex/analytics/` が日次蓄積するKPIを、本人だけが確認する内部BIである。
顧客向けの本体アプリと分け、Cloudflare WorkerとStatic Assetsで配信する。

ブラウザは同一originの `/api/analytics` だけを呼ぶ。
WorkerがConvex HTTP Actionへ問い合わせるため、共有secretをブラウザへ渡さない。
閲覧者のアクセス制御は共有secretではなく、Cloudflare AccessなどWorker到達前の境界で行う。

## 関連ファイル

- `apps/analytics-dashboard/src/pages/DashboardPage.tsx`：ページ入口
- `apps/analytics-dashboard/src/features/dashboard/`：タブと詳細表示
- `apps/analytics-dashboard/src/domains/analytics/`：派生KPI、整形、chart変換
- `apps/analytics-dashboard/src/api/analyticsClient.ts`：ブラウザのAPI client
- `apps/analytics-dashboard/src/worker.ts`：Worker入口、APIとStatic Assetsの振り分け
- `apps/analytics-dashboard/src/server/analyticsProxy.ts`：ConvexへのBFF proxy
- `apps/analytics-dashboard/wrangler.jsonc`：WorkerとStatic Assetsの設定
- `convex/analyticsDashboard/`：DTO、入力schema、HTTP Action、internal query
- `convex/http.ts`：`/analytics-dashboard/query` の登録
- `apps/analytics-dashboard/package.json`：開発、検証、buildコマンド
- `apps/analytics-dashboard/AGENTS.md`：このアプリで常に守る制約

画面とAPIの現在仕様はコード、実行コマンドは各 `package.json`、配信設定は `wrangler.jsonc` を正本とする。

## 画面

| パス | 用途 |
|---|---|
| `/` | 店舗ステージ、全体傾向、募集と提出、通知、店舗別KPI、要望を確認する |

画面は全体サマリー、開始前、立ち上げ、運用中、休眠、店舗一覧、要望のタブで構成する。
各タブの指標、算出、並び順は `apps/analytics-dashboard/src/features/dashboard/` と `apps/analytics-dashboard/src/domains/analytics/` を正本とする。
店舗ステージの判定は `convex/analytics/stage.ts` と `doc/features/analytics.md` を参照する。

## API

| 境界 | 入口 | 用途 |
|---|---|---|
| Cloudflare Worker | `src/worker.ts:fetch` | `/api/analytics` を処理し、ほかをStatic Assetsへ渡す |
| BFF | `src/server/analyticsProxy.ts:handleAnalyticsApi` | requestを検証用情報とともにConvexへ転送する |
| Convex HTTP Action | `analyticsDashboard/httpActions:query` | service credentialと入力を検証し、internal queryを呼ぶ |
| Convex internal query | `analyticsDashboard/queries.ts` | KPI、店舗、募集履歴、要望を読み取る |

request kind、引数、返却DTOは `convex/analyticsDashboard/schemas.ts` と `dto.ts` を正本とする。

## セキュリティ境界

- ブラウザからConvex public functionを直接呼ばない。
- Convex URLとservice credentialをWorkerのサーバー側環境変数に置く。
- API本文、件数、期間、cursor、limitを信頼境界で検証する。
- 返却DTOへstaff email、manager email、token、通知本文、providerのraw errorを含めない。
- HTMLと静的assetを検索インデックスの対象外にする。
- snapshotの上限を超えた場合は、不完全な値を正常値として返さない。

共通の理由と判断基準は `doc/rules/security-strategy.md` と `doc/rules/convex-design-strategy.md` を参照する。

## 検証

`apps/analytics-dashboard/` のfrontendは、自動テストとFull Regressionの対象外である。
`convex/analyticsDashboard/` のAPI契約は既存のConvex Testで守る。
frontend変更時の検証コマンドは `package.json` と `apps/analytics-dashboard/package.json` を正本とする。
