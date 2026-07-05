# 分析KPI可視化アプリ

`convex/analytics/` に日次蓄積したKPIを、本人だけが見る内部BIとして可視化する別アプリ。
本体アプリの顧客向け導線とは分離し、Cloudflare Pages FunctionsのBasic認証とConvex HTTP actionの共有secretで読み取り経路を保護する。

## 関連ファイル

- `apps/analytics-dashboard/AGENTS.md` — アプリの目的、責務、セキュリティ境界、共通化方針
- `apps/analytics-dashboard/package.json` — 分析アプリ単体の依存とscript
- `apps/analytics-dashboard/src/pages/DashboardPage.tsx` — KPI可視化画面
- `apps/analytics-dashboard/src/api/analyticsClient.ts` — `/api/analytics` のfetch client
- `apps/analytics-dashboard/src/domains/analytics/` — 派生KPI、表示整形、chart series変換
- `apps/analytics-dashboard/functions/_middleware.ts` — Basic認証middleware
- `apps/analytics-dashboard/functions/api/analytics.ts` — Convex HTTP actionへのBFF proxy
- `convex/analyticsDashboard/dto.ts` — 画面用DTO
- `convex/analyticsDashboard/schemas.ts` — HTTP action入力検証
- `convex/analyticsDashboard/queries.ts` — internal query
- `convex/analyticsDashboard/httpActions.ts` — Pages FunctionsからのHTTP入口
- `convex/http.ts` — `/analytics-dashboard/query` route登録
- `pnpm-workspace.yaml` — `apps/*` と共通依存catalog
- 設計書: `doc/plans/2026-07-05_分析KPI可視化アプリ_設計.md`

## 画面一覧

| 画面 | パス | 用途 |
|---|---|---|
| Analytics Dashboard | `/` | サービス全体、募集・提出、通知、LINE、店舗別のKPIを期間指定で確認する |

## API一覧

### Cloudflare Pages Functions

| API | 用途 |
|---|---|
| `functions/_middleware.ts:onRequest` | 静的ファイル/APIの前段でBasic認証を検証 |
| `functions/api/analytics.ts:onRequest` | ブラウザからのPOSTをConvex HTTP actionへproxyし、env labelを付与 |

### Convex HTTP action

| API | 用途 |
|---|---|
| `analyticsDashboard/httpActions:query` | `x-shiftori-internal-api-secret` を検証し、request kindごとにinternal queryを呼ぶ |

### Convex internal query

| API | 用途 |
|---|---|
| `analyticsDashboard/queries:getOverview` | サービス全体スナップショットと主要イベント合計 |
| `analyticsDashboard/queries:getEventTrends` | metric別の時系列 |
| `analyticsDashboard/queries:getNotificationBreakdown` | 通知チャネル・結果・種別ごとの内訳 |
| `analyticsDashboard/queries:getShopRanking` | 店舗別スナップショットのランキング |
| `analyticsDashboard/queries:getShopDetail` | 1店舗の時系列ドリルダウン |

## セキュリティ境界

- ブラウザはConvex public queryを直接呼ばない
- Convex URLと共有secretはCloudflare Pages Functionsのサーバー側envに置く
- Convex HTTP actionは `SHIFTORI_INTERNAL_API_SECRET` を検証する
- 返却DTOは集計値と店舗単位の情報に限定し、staff email、manager email、token、raw notification payload、provider error bodyを返さない
- 期間、metric、limitはHTTP action側で検証する

## ローカル開発

- `pnpm analytics:dev` はVite dev server側の `/api/analytics` proxyを使う
- `pnpm analytics:dev:production` はworkspace rootの `.env.production` を読んでVite dev serverを起動する
- Vite dev proxyはworkspace rootの `.env` / `.env.local` を読み込む
- 接続先Convexは `VITE_CONVEX_SITE_URL` を使い、未設定時は `VITE_CONVEX_URL` の `.convex.cloud` を `.convex.site` に変換する
- Pages Functions / Vite dev proxy / Convex deployment側で同じ値の `SHIFTORI_INTERNAL_API_SECRET` を使う
