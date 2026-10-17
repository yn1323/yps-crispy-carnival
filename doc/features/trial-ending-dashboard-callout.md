# Dashboardの課金案内

Dashboardには、現在プラン、組織全体の利用数、「プランと支払い」への常設導線を表示しない。
例外として、有料プランの継続を登録していないTrialの終了前案内と、支払い失敗後の再契約案内を表示する。
組織切替はPC・モバイル共通のアプリヘッダー、同じ組織内の店舗切替はDashboardの店舗セレクタ、契約確認と変更は`/manage/billing?org=<organizationId>`で扱う。

## トライアル終了前の案内

Trialは2か月と長く、終了と同時にFreeの上限（5名・1店舗・管理者2名）を超える組織が多い。
上限を超えると管理者の通常操作に加えてスタッフの希望シフト提出と通知も止まるため、次のシフト募集を作る前に判断できるよう、終了14日前からDashboardの上部で案内する。
シフトリから課金メールは送らない方針（[業務要件](../specs/organization-billing-business-flow.md)の10.3）は変えない。

対象は、課金stateが`trial`で、StandardまたはProの継続を登録していない組織だけである。
継続を登録済みの組織、Free、有料プラン、支払い不要Pro相当には表示しない。

| 段階 | 期間 | 表示の強さ | 閉じ方 |
|---|---|---|---|
| 残り14日 | 終了の14日前から8日前まで | 情報（neutral） | 「後で確認する」で閉じると、同じ組織の同じTrialでは残り7日の段階まで表示しない |
| 残り7日 | 終了の7日前から前日まで | Free上限を超える、または利用数を確認できない組織は要対応（warning） | 閉じても、次にDashboardを開いたときに再表示する |
| 最終日 | 最終利用日の0:00 JSTから終了まで | 残り7日と同じ | 閉じられない |

`trialEndsAt`は最終利用日の翌日0:00 JSTという排他的な境界なので、最後の24時間を最終日として扱う。
表示中に段階の境界を迎えた場合は、画面を開いたまま再評価する。

本文は、終了後にFreeの上限を超えるかどうかで変える。
上限を超える組織には、超える項目の現在数（利用人数、店舗数、管理者数）と、シフト募集・スタッフの希望シフト提出・通知が止まることを示す。
上限内の組織には、Freeで続けて使えることを示し、どの段階でも要対応の色を使わない。
利用数を確認できない場合は、上限を超えている場合の影響を条件付きで示す。
どの場合も「プランを選ぶ」から`/manage/billing?org=<organizationId>`へ進める。

Free上限の評価は、Dashboardの業務可否と同じ実利用数のbounded probeを使い、保存しない。
URLやfrontendの表示は契約操作の権限にならず、契約操作は「プランと支払い」の既存のサーバー認可に従う。

## 現在の表示境界

`getDashboardShop`が返す`canWriteBusinessData`と`businessWriteBlockReason`は、Dashboardの業務操作可否と閲覧専用案内に使う。
上限超過または利用上限評価不能でも、frontendの表示だけを認可根拠にせず、mutationが実行時の組織所属と課金policyを再検証する。

支払い失敗からFreeへ変更された組織では、`paymentFailure`を使って再契約案内を表示する。
`terminationPending`はStripeでの終了処理中かどうか、`canStartPaidPlan`は現在の課金stateとStripe設定で有料プランを契約できるかを表し、Dashboardはこの判定を作り直さない。

課金stateに応じた現在プラン、料金、利用人数・店舗数・管理者数、契約操作は「プランと支払い」で表示する。

## 関連ファイル

- `src/pages/dashboard/index.tsx` — 現在店舗、業務更新可否、閲覧専用案内、課金案内をDashboardへ接続する
- `src/components/features/Dashboard/TrialEndingNotice/` — トライアル終了前案内の段階、文言、時刻境界の再評価、閉じた状態、Storybookを所有する
- `src/components/features/Dashboard/DashboardContent/` — Dashboardの業務状態を合成し、課金表示は合成しない
- `src/components/shared/OrganizationPaymentFailureAlert/` — 支払い失敗後の再契約案内を表示する
- `convex/dashboard/queries.ts` — 店舗情報、業務更新可否、支払い失敗後の再契約可否、トライアル終了前案内の最小DTOを返す
- `convex/organizationBilling/service.ts` — 現在の利用実数をTrial終了後のFree上限で評価する
