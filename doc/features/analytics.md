# 分析KPI蓄積基盤

サービス全体の利用状況KPI（店舗数・スタッフ数・シフト提出率・確定リードタイム・通知送信/失敗数・LINE連携率・催促送信数など）を日次cronで専用テーブルに蓄積し、時系列で分析できるようにするバックエンド基盤。**公開APIなし・internal専用**（画面はない）。

## 関連ファイル

- `convex/analytics/metrics.ts` — metric名の定義（イベント系 + 通知系テンプレートリテラル型）
- `convex/analytics/stage.ts` — 店舗ライフサイクルステージの分類ロジック（純粋関数）
- `convex/analytics/dailyAggregation.ts` — 日次集計（Phase 1〜6 の自己再帰チェーン）
- `convex/analytics/mutations.ts` — 絶対値upsertプリミティブ（冪等性の要）
- `convex/analytics/queries.ts` — 参照用internalQuery
- `convex/analytics/backfill.ts` — イベント系KPIの全期間バックフィル
- `convex/schema.ts` — `analyticsDailyServiceSnapshots` / `analyticsDailyShopSnapshots` / `analyticsDailyEventCounts`
- `convex/crons.ts` — `analytics-daily-aggregation`（JST 03:00）
- `convex/_lib/dateFormat.ts` — `jstDayRangeMs` / `dateJST`
- 設計書: `doc/plans/2026-07-04_分析KPI蓄積基盤_設計.md`

## 画面一覧

なし（Convexダッシュボード / `npx convex run` で参照する運用ツール）。

## API一覧（すべてinternal）

| API | 用途 |
|---|---|
| `analytics/dailyAggregation:run` | 日次集計のエントリ。`{date?}` 省略時は前日（JST）。cronから毎日03:00 JSTに起動 |
| `analytics/backfill:start` | イベント系KPIの全期間復元。`{fromDate?, toDate?}` 省略時は最古の店舗作成日〜前日 |
| `analytics/queries:getServiceSnapshotRange` | サービス全体スナップショットの期間取得 `{from, to}` |
| `analytics/queries:getEventSeries` | 単一metricの時系列取得 `{metric, from, to}` |
| `analytics/queries:getShopSnapshotSeries` | 店舗別スナップショットの時系列取得 `{shopId, from, to}` |
| `analytics/queries:getDailySummary` | 1日分のスナップショット+全metric `{date}` |

## KPIの2分類

| 分類 | テーブル | 過去分 |
|---|---|---|
| 状態スナップショット（その日時点の値） | `analyticsDailyShopSnapshots` / `analyticsDailyServiceSnapshots` | 導入日から蓄積（過去復元不可） |
| イベントカウンタ（その日に起きた件数） | `analyticsDailyEventCounts`（date × metric 縦持ち） | バックフィルで全期間復元可能 |

## metric一覧と算出定義

### イベント系（`analytics/metrics.ts` の `ANALYTICS_METRICS`）

| metric | 数えるもの | 日付の根拠 | valueSum |
|---|---|---|---|
| `shop.created` | 店舗登録数 | `shops._creationTime` | — |
| `staff.created` | スタッフ登録数 | `staffs._creationTime` | — |
| `recruitment.created` | 募集作成数 | `recruitments._creationTime` | — |
| `recruitment.confirmed` | シフト確定数 | `confirmedAt` | 作成→確定リードタイム合計ms |
| `recruitment.confirmed.submittedTotal` | 確定募集の提出者数合計 | 同上 | `recruitmentStats.submittedCount` 合計 |
| `recruitment.confirmed.expectedStaffTotal` | 確定募集の提出対象者数合計 | 同上 | `activeStaffCountSnapshot` 合計 |
| `submission.first` | 希望シフト初回提出数 | `shiftSubmissions._creationTime` | — |
| `line.linked` | LINE連携完了数 | `staffLineAccounts.linkedAt` | — |
| `staffRegistration.requested` | 参加申請数 | `_creationTime` | — |
| `staffRegistration.approved` / `.rejected` | 承認/却下数 | `reviewedAt` | — |

### 通知系（`notification.{email|line}.{sent|failed}.{recruitment|reminder|confirmation|lineInvite|other}`）

- 種別分類は `describeNotificationFailureContext()`（`convex/notificationOutbox/failureResend.ts`）が正典
- **催促送信数** = `notification.*.sent.reminder`
- **失敗数** = 最終失敗のみ（`status="failed"`）。リトライ中の一時失敗は含まない
- dry-run（`payload.suppressDelivery`）はKPI対象外
- 発生ゼロの組み合わせも0行を書く（「未集計」と「0件」を区別するため）

### 派生KPI

- **提出率（確定日ベース）** = `recruitment.confirmed.submittedTotal.valueSum ÷ recruitment.confirmed.expectedStaffTotal.valueSum`
- **平均確定リードタイム** = `recruitment.confirmed.valueSum ÷ count`
- **LINE連携率** = スナップショットの `lineLinkedStaffCount ÷ shiftTargetStaffCount`（分母はシフト対象スタッフ）

## 店舗ライフサイクルステージ（`analytics/stage.ts`）

店舗スナップショット集計（Phase 1）で、店舗を利用段階で分類して保存する。ステージそのものはKPIではなく、日次の`shopStageCounts`推移と店舗別`stage`履歴から**遷移率**（開始前→実利用開始率、立ち上げ→継続化率、継続→休眠化率、休眠→復帰率）を算出するための元データ。ダッシュボードでは、選択期間内の最初と最後のステージスナップショットを比較して期間内ステージ遷移率を表示する。

| ステージ | 条件 |
|---|---|
| `beforeStart`（開始前） | 実利用開始条件を満たしていない |
| `activeTrial`（立ち上げ） | 実利用開始済み・確定3件未満・現在稼働中 |
| `activeTrialDormant`（立ち上げ後休眠） | 実利用開始済み・確定3件未満・稼働停止 |
| `retained`（継続中） | 確定3件以上 + 現在も稼働中 |
| `retainedDormant`（継続後休眠） | 確定3件以上だが稼働停止 |

- **実利用開始条件** = シフト対象スタッフ3人以上 + 募集2件以上 + 通知送信または提出が発生済み
- **現在稼働中** = 対象日基準の現在/未来の確定シフト or 進行中募集 or 直近30日以内の主要イベント（スタッフ追加・募集作成・提出・確定・催促・LINE連携）のいずれか
- ステージ判定は、集計実行時刻ではなく対象JST日の終端（`stageReferenceAt`）を基準にする。cronが翌日03:00 JSTに前日分を集計しても、前日終了時点の店舗状態として扱う
- 判定材料（`recruitmentCount` / `confirmedRecruitmentCount` / `hasSubmission` / `lastActivityAt` / `stageReferenceAt` 等）もスナップショットに保存し、ダッシュボードで判定理由とアラート（気になる点）を再構成できるようにする
- 開始前店舗の最終到達ステップは、分析DBで確認できる事実だけで `店舗登録` / `テスト募集作成` / `テスト申請` / `テスト確定` / `スタッフ登録` / `スタッフ3人登録` / `本番シフト作成` / `通知送信` / `実利用開始` の順に出す。現状は「ガイド開始」を永続計測していないため、ダッシュボードのチェックリストでは `未計測 ガイド開始` として表示する
- 継続/休眠の目検用に、店舗別スナップショットへ `recruitmentCreatedLast30Days`（直近30日の募集作成数）、`submittedRecruitmentCount`、`submissionRate`、`averageFirstSubmissionLeadTimeMs`、`averageConfirmationLeadTimeMs`、`emailNotificationSentCount`、`lineNotificationSentCount`、`postReminderSubmissionRate`、`resubmissionRate`、`lastRecruitmentSubmissionRate`、`lastRecruitmentCreatedAt`、`lastRecruitmentConfirmedAt`、`lastConfirmedRecruitmentLeadTimeMs` も保存する。既存日付は `analytics/dailyAggregation:run` で対象日を再集計すると埋まる
- LINE連携は実利用開始条件に**含めない**（メール運用でも継続店舗として扱う）。利用深度の指標としてのみ見る

## 集計の仕組み

- cron `analytics-daily-aggregation`（JST 03:00 = UTC 18:00、delivery-event-prune より前）が前日分を集計
- internalMutationの自己再帰チェーン。累積値はscheduler引数で運び、各フェーズの最終ページでのみ**絶対値upsert** → 同日再実行は常に上書きで冪等
- 日付境界はJSTの半開区間 `[00:00, 24:00)`（`jstDayRangeMs`）
- 作成数系は論理削除をフィルタしない（「その日に作成された数」は不変）。スナップショットは `isDeleted=false` のみ

## 運用手順

```bash
# バックフィル（デプロイ後に1回。イベント系KPIを全期間復元）
npx convex run analytics/backfill:start '{}'

# 参照例
npx convex run analytics/queries:getServiceSnapshotRange '{"from":"2026-06-01","to":"2026-07-03"}'
npx convex run analytics/queries:getEventSeries '{"metric":"notification.email.sent.reminder","from":"2026-04-01","to":"2026-07-03"}'
npx convex run analytics/dailyAggregation:run '{"date":"2026-07-03"}'  # 特定日の再集計
```

将来ダッシュボード画面等で公開する場合は、`analytics/queries.ts` の `fetch*` 関数をadminQueryラッパーで包み直す。
