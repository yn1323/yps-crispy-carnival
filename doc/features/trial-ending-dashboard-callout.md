# Dashboardの課金案内

Dashboardには、現在プラン、組織全体の利用数、トライアル終了前Callout、「プランと支払い」への常設導線を表示しない。
支払い失敗後の再契約案内だけは例外として表示する。
組織切替はPC・モバイル共通のアプリヘッダー、同じ組織内の店舗切替はDashboardの店舗セレクタ、契約確認と変更は`/manage/billing?org=<organizationId>`で扱う。

## 現在の表示境界

`getDashboardShop`が返す`canWriteBusinessData`と`businessWriteBlockReason`は、Dashboardの業務操作可否と閲覧専用案内に使う。
上限超過または利用上限評価不能でも、frontendの表示だけを認可根拠にせず、mutationが実行時の組織所属と課金policyを再検証する。

支払い失敗からFreeへ変更された組織では、`paymentFailure`を使って再契約案内を表示する。
`terminationPending`はStripeでの終了処理中かどうか、`canStartPaidPlan`は現在の課金stateとStripe設定で有料プランを契約できるかを表し、Dashboardはこの判定を作り直さない。

課金stateに応じた現在プラン、料金、利用人数・店舗数・管理者数、契約操作は「プランと支払い」で表示する。
トライアル終了前の案内はDashboardへ重複表示せず、契約画面と既存の通知経路を正本にする。

## 関連ファイル

- `src/pages/dashboard/index.tsx` — 現在店舗、業務更新可否、閲覧専用案内をDashboardへ接続する
- `src/components/features/Dashboard/DashboardContent/` — Dashboardの業務状態を合成し、課金表示は合成しない
- `src/components/shared/OrganizationPaymentFailureAlert/` — 支払い失敗後の再契約案内を表示する
- `convex/dashboard/queries.ts` — 店舗情報、業務更新可否、支払い失敗後の再契約可否を返す
