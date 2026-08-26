# Dashboardの課金案内

Dashboardには、現在プラン、組織全体の利用数、トライアル終了前Callout、「プランと支払い」への導線を表示しない。
組織切替はPC・モバイル共通のアプリヘッダー、同じ組織内の店舗切替はDashboardの店舗セレクタ、契約確認と変更は`/manage/billing?org=<organizationId>`で扱う。

## 現在の表示境界

`getDashboardShop`が返す`canWriteBusinessData`と`businessWriteBlockReason`は、Dashboardの業務操作可否と閲覧専用案内に使う。
上限超過または利用上限評価不能でも、frontendの表示だけを認可根拠にせず、mutationが実行時の組織所属と課金policyを再検証する。

課金stateに応じた現在プラン、料金、利用人数・店舗数・管理者数、契約操作は「プランと支払い」で表示する。
トライアル終了前の案内はDashboardへ重複表示せず、契約画面と既存の通知経路を正本にする。

## rolling deploy互換

`getDashboardShop`の`planStatus`と`trialEndingNotice`、`getDashboardPlanUsage`、`PlanStatusCard`、`TrialEndingCallout`は旧frontendとのrolling deploy互換として残っている。
現在のDashboardはこれらを購読・合成せず、DashboardContentとOperationContextのStoryにも課金表示を含めない。

新旧frontendとbackendのdrainを確認した後、互換DTO、query、component、単体テストをNarrowで削除する。
Productionへの反映済み判定はリポジトリ実装と分け、[組織課金、複数店舗、複数管理者](organization-billing.md)と[リリース状態](../manual/release-status.md)を参照する。

## 関連ファイル

- `src/pages/dashboard/index.tsx` — 現在店舗、業務更新可否、閲覧専用案内をDashboardへ接続する
- `src/components/features/Dashboard/DashboardContent/` — Dashboardの業務状態を合成し、課金表示は合成しない
- `src/components/features/Dashboard/PlanStatusCard/` — Narrow待ちの旧frontend互換component
- `src/components/features/Dashboard/TrialEndingCallout/` — Narrow待ちの旧frontend互換component
- `convex/dashboard/queries.ts` — 店舗情報と業務更新可否を返し、rolling deploy用の旧DTOを互換提供する
