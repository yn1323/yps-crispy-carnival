# 分析KPI可視化アプリ

`convex/analytics/` に日次蓄積したKPIを、本人だけが見る内部BIとして可視化する別アプリ。
本体アプリの顧客向け導線とは分離し、Cloudflare Workers + Static Assets の別Workerで可視化する。
ブラウザは同一originのWorker APIだけを呼び、WorkerとConvex HTTP actionの共有secretで読み取り経路を保護する。
内部用アプリのため、HTMLの `robots` メタタグとWorker応答の `X-Robots-Tag` で検索インデックス対象から除外する。

## 関連ファイル

- `apps/analytics-dashboard/AGENTS.md` — アプリの目的、責務、セキュリティ境界、共通化方針
- `apps/analytics-dashboard/package.json` — 分析アプリ単体の依存とscript
- `apps/analytics-dashboard/src/pages/DashboardPage.tsx` — KPI可視化画面
- `apps/analytics-dashboard/src/api/analyticsClient.ts` — `/api/analytics` のfetch client
- `apps/analytics-dashboard/src/domains/analytics/` — 派生KPI、表示整形、chart series変換
- `apps/analytics-dashboard/src/worker.ts` — Workers + Static Assets の入口、`/api/analytics` ルーティング、静的asset応答
- `apps/analytics-dashboard/src/server/analyticsProxy.ts` — Convex HTTP actionへのBFF proxy
- `apps/analytics-dashboard/index.html` — HTML入口と `robots` メタタグ
- `apps/analytics-dashboard/wrangler.jsonc` — Worker entrypoint、Static Assets、`/api/*` の先行ルーティング設定
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
| Analytics Dashboard | `/` | 店舗ステージ、サービス全体、募集・提出、通知、LINE、店舗別のKPIを期間指定で確認する |

「店舗ステージ」タブが最初に開く。ステージ別店舗数カード（開始前/立ち上がり中/継続中/休眠中）、要確認フィルタ付きの店舗一覧（最終到達ステップ・停止日数・気になる点タグ）、ステージ別店舗数の日次推移を表示する。分類ロジックは `convex/analytics/stage.ts`（`doc/features/analytics.md` 参照）。

## API一覧

### Cloudflare Worker

| API | 用途 |
|---|---|
| `src/worker.ts:fetch` | `/api/analytics` をWorkerで処理し、それ以外をStatic Assetsへ委譲 |
| `src/server/analyticsProxy.ts:handleAnalyticsApi` | ブラウザからのPOSTをConvex HTTP actionへproxyし、env labelを付与 |

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
| `analyticsDashboard/queries:getShopStages` | 指定日の店舗ステージ一覧（判定材料・最終到達ステップ・気になる点タグ付き） |
| `analyticsDashboard/queries:getShopRanking` | 店舗別スナップショットのランキング |
| `analyticsDashboard/queries:getShopDetail` | 1店舗の時系列ドリルダウン |

## セキュリティ境界

- ブラウザはConvex public queryを直接呼ばない
- Convex URLと共有secretはCloudflare Workerのサーバー側envに置く
- Convex HTTP actionは `SHIFTORI_INTERNAL_API_SECRET` を検証する
- HTMLと静的assetのWorker応答へ `X-Robots-Tag: noindex, nofollow` を付ける
- 返却DTOは集計値と店舗単位の情報に限定し、staff email、manager email、token、raw notification payload、provider error bodyを返さない
- 期間、metric、limitはHTTP action側で検証する

## ローカル開発

- `pnpm analytics:dev` はVite dev server側の `/api/analytics` proxyを使う
- `pnpm analytics:dev:production` はworkspace rootの `.env.production` を読んでVite dev serverを起動する
- Vite dev proxyはworkspace rootの `.env` / `.env.local` を読み込む
- 接続先Convexは `VITE_CONVEX_SITE_URL` を使い、未設定時は `VITE_CONVEX_URL` の `.convex.cloud` を `.convex.site` に変換する
- Cloudflare Worker / Vite dev proxy / Convex deployment側で同じ値の `SHIFTORI_INTERNAL_API_SECRET` を使う

## デプロイ

- Cloudflare WorkersのRoot directoryは `apps/analytics-dashboard`
- Build commandは `pnpm build`
- Deploy commandは `npx wrangler deploy`
- Static Assetsは `wrangler.jsonc` の `assets.directory = "./dist"` を使う
- `/api/*` は `run_worker_first` でWorkerに先に通す
