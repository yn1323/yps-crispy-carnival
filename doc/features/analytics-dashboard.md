# 分析KPI可視化アプリ

分析projectionと日次snapshotを、内部担当者だけが閲覧する分離Dashboardです。  
サービス全体からグループ、店舗、cycleへ掘り下げ、導入到達度と運用健全性を別々に確認できます。

顧客向け本体アプリとは別のCloudflare WorkerとStatic Assetsで配信します。  
実環境での公開状態は[リリース状態](../manual/release-status.md)を参照してください。

## 画面

stage別tabは使わず、分析対象ごとにrouteを分けます。

| route | 用途 |
|---|---|
| `/` | North Star、KPI推移、milestone、health、グループ比較、要確認店舗 |
| `/organizations` | グループの比較、sort、filter、pagination |
| `/organizations/:organizationId` | グループの店舗、人員構成、管理者、KPI |
| `/shops` | 店舗の比較、health、segment、pagination |
| `/shops/:shopId` | 店舗の現在値、milestone、KPI推移、cycle一覧 |
| `/shops/:shopId/cycles/:recruitmentId` | 一つのcycleの提出、通知、確定、完全性 |
| `/requests` | 分析モデルと分けた要望一覧 |

期間、集計単位、filter、sort、cursorはURL query parameterへ保存します。  
行を選ぶと詳細routeへ遷移し、戻る操作と共有URLで分析状態を再現できます。

全体サマリーの`AI向けJSONLを出力`では、現在適用中の期間、比較期間、集計単位、グループ・店舗scope、segmentの比較軸を固定し、全pageを一つのJSON Linesファイルへまとめてローカル保存します。  
全体KPI、全trend指標、milestone、health、segment、グループ、店舗、店舗別推移、cycleを含みます。途中pageの取得失敗、出力中のsnapshot更新、安全上限の超過時は、欠けたJSONLを保存せずerrorとして表示します。

JSONLは先頭行をmanifest、以降を`recordType`付きの1行1recordとし、AIが行単位で分割して読める形にします。関連recordは`organizationId`、`shopId`、`recruitmentId`で結合します。グループまたは店舗scopeでは、scope非対応のsegmentを混在させず、非出力理由をrecordに残します。  
グループと店舗は`organizationId`、`shopId`で識別し、グループ名と店舗名は除外します。  
スタッフ氏名、email、電話番号、LINE user ID、シフト提出内容、通知本文、要望一覧・要望本文、service credentialも含めません。Dashboardから外部AIへ自動送信せず、保存後のファイルをどこへ渡すかは利用者が判断します。

## 表示状態

`/requests`を除くAnalytics routeでは、`asOf`、`dataStartDate`、`latestCompleteSnapshotDate`、`computedAt`、`completeness`、警告を表示します。  
`/requests`はpipeline状態を画面表示せず、現在の要望を独立した一覧として表示します。

| 状態 | 表示 |
|---|---|
| 正確な0 | `0`または`0%` |
| pipeline処理前 | 集計待ち |
| 一部だけ処理済み | 警告付きの一部集計 |
| 過去の分母を復元不能 | 算出不可 |
| filter結果が0件 | 条件に一致するデータなし |
| 現在のraw pageに一致せず次cursorあり | このページには一致なし。次の候補あり |
| API失敗 | 取得失敗。0へ置換しない |

`partial`または`unavailable`な率をrankingへ含めません。  
cycle詳細は個人名を表示せず、必要な場合だけopaque ID、提出有無、初回提出時刻、通知結果を扱います。

## API境界

```text
Browser -> Cloudflare Access -> Worker BFF -> Convex HTTP Action -> internal Analytics query
```

ブラウザは同一originの固定GET endpointだけを呼びます。  
Workerのservice credentialとConvex URLはサーバー側環境変数に置き、ブラウザへ返しません。
Workerはrequestを検証し、固定されたConvex route `POST /analytics-dashboard/query` へ転送します。

| method | Worker BFF path | 主なresponse |
|---|---|---|
| `GET` | `/api/analytics/overview` | 全体KPIと最新完全日 |
| `GET` | `/api/analytics/trends` | 日、週、月のKPI推移 |
| `GET` | `/api/analytics/milestones` | 導入到達数と転換 |
| `GET` | `/api/analytics/health` | health signal別店舗数 |
| `GET` | `/api/analytics/organizations` | グループ一覧 |
| `GET` | `/api/analytics/organizations/:organizationId` | グループ詳細 |
| `GET` | `/api/analytics/shops` | 店舗一覧 |
| `GET` | `/api/analytics/shops/:shopId` | 店舗詳細 |
| `GET` | `/api/analytics/shops/:shopId/cycles` | cycle一覧 |
| `GET` | `/api/analytics/shops/:shopId/cycles/:recruitmentId` | cycle詳細 |
| `GET` | `/api/analytics/segments` | segment比較 |
| `GET` | `/api/requests` | 要望一覧 |

Analytics responseはすべて次のmetadataを持ちます。

- `asOf`
- `dataStartDate`
- `latestCompleteSnapshotDate`
- `computedAt`
- `completeness`
- `warnings`
- `pageInfo`

Analytics listはcursor paginationで初期50件、最大100件です。`/requests`は一page最大50件です。  
trendは最大366点、期間は最大5年、responseは512 KiB未満に制限します。

複合filterはindexで狭めた一page最大100件の候補へ適用します。現在pageの一致が0件でもraw cursorに続きがあれば確定0件にせず、warningと次cursorを返します。

query parameterはendpointごとのallowlistで検証します。  
任意のConvex function名、index名、field式は受け取らず、存在しないIDは詳細を漏らさない同一のnot found responseにします。

## データ境界

`/requests`以外のAnalytics queryは`activeGeneration`の新しいAnalytics tableだけを読みます。  
organizations、shops、staffs、recruitments、notificationOutboxなどの運用tableや、旧3 Analytics tableを直接読みません。

要望一覧はAnalytics pipelineへ混ぜず、独立した`/requests`契約として残します。これはDashboard queryが運用tableを読まない原則の唯一の例外で、`featureRequests`と現在の`shops`を直接読み、一page最大50件を返します。  
グループ名と店舗名は内部識別のため返しますが、staff email、manager email、token、通知本文、provider raw errorはDTOへ含めません。

## セキュリティと運用

- Cloudflare Accessを閲覧者の認証境界にします。
- HTTP Actionはservice credential、request size、固定request kind、rate limitを検証します。
- error logにはpayload、表示名、credentialを含めません。
- staleまたはpartialなpipeline状態はmetadataと画面上部の警告で示します。
- JSONL出力は既存の固定GET endpointだけを全page取得し、新しい汎用proxyやexport用public APIを追加しません。service rate limitへ余白を残して逐次取得し、429だけは`Retry-After`に従って再試行します。
- HTMLとStatic Assetsを検索indexの対象外にします。

Productionでは[セキュリティ再検証](../manual/security-validation.md)の`ENV-BI-01`から`ENV-BI-05`を、同じrevisionに対して確認します。

## 関連ファイル

- `apps/analytics-dashboard/src/app/App.tsx`
- `apps/analytics-dashboard/src/routes/`
- `apps/analytics-dashboard/src/pages/`
- `apps/analytics-dashboard/src/features/analytics/`
- `apps/analytics-dashboard/src/features/requests/`
- `apps/analytics-dashboard/src/api/analyticsClient.ts`
- `apps/analytics-dashboard/src/server/analyticsRoutes.ts`
- `apps/analytics-dashboard/src/server/analyticsProxy.ts`
- `apps/analytics-dashboard/src/worker.ts`
- `convex/analyticsDashboard/dto.ts`
- `convex/analyticsDashboard/schemas.ts`
- `convex/analyticsDashboard/queries.ts`
- `convex/analyticsDashboard/httpActions.ts`
- [分析KPI蓄積基盤](analytics.md)
- [Analytics rollout](../manual/analytics-rollout.md)
