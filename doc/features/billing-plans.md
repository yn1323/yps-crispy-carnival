# 店舗単位課金プランの旧検討

この文書名は既存リンクを維持するために残している。
現在の課金契約はグループ単位であり、実装と業務判断は[グループ課金、複数店舗、複数管理者](organization-billing.md)と[業務フロー](../specs/organization-billing-business-flow.md)を参照する。

## 現行仕様との違い

- `shopBillingStates`の`free`、`standard`、`premium`は、分析と旧読み取りの互換性を保つために残した旧モデルである。
- 新しい課金状態の正本は`organizationBillingStates`であり、Free、Trial、Pro、Pro（先行登録特典）とライフサイクル状態を一つのstate unionで表す。
- プラン上限と操作可否は`convex/organizationBilling/policy.ts`から導出する。
- 支払い確認中、支払い猶予、期間末変更予定、契約制限中はプランではなくライフサイクル状態である。
- Businessプランは廃止し、通常課金の有料プランをProへ統一する。
- 旧Business値は`m018`の全環境完了までWiden互換としてだけ受け入れ、新規書き込みとpolicyではProへ正規化する。

## 現行の表示区分と上限

| 表示区分 | 保存状態 | 利用人数 | 稼働店舗 | 有効管理者 | Stripe連携 |
| --- | --- | ---: | ---: | ---: | --- |
| Free | `active.free` | 5 | 1 | 1 | なし |
| Trial | `trial` | 30 | 5 | 5 | 継続登録時に連携（請求はTrial終了後） |
| Pro | `active.pro` | 30 | 5 | 5 | あり |
| Pro（先行登録特典） | `complimentary.pro` | 30 | 5 | 5 | なし |

Trialはグループを作成した月と、その翌月の末日まで利用できる。

Pro（先行登録特典）は、Stripe Customer、Subscription、Checkout Session、Portal Session、請求、課金通知を一切持たない。

Pro（先行登録特典）は、公開API、管理用処理、Stripeイベント、再同期処理から別の課金状態へ変更しない。

## Stripe公開状態

Localと開発用Convex deploymentは、それぞれ専用のStripe Sandboxへ`sk_test_`で始まるSecret keyを使って接続する。
接続環境は`STRIPE_SECRET_KEY`の接頭辞から自動判定し、月額JPY 1,480のPro Priceを含むStripeオブジェクトの`livemode`と一致しない場合は課金操作を拒否する。

本番deploymentは本番Stripeアカウントへ`sk_live_`で始まるSecret keyを使って接続する。
税、日割り、返金、クレジット、未払い請求の最終処理と本番用Stripe設定を確認するまではPro Priceをアーカイブし、新規販売を停止する。
販売停止前に発行したopen状態のCheckout Sessionは別途失効させるが、既存契約のWebhook受信、再照合、取消、請求停止は継続する。

## 参考ファイル

- `doc/features/organization-billing.md`
- `doc/specs/organization-billing-business-flow.md`
- `doc/plans/2026-07-20_Stripe課金連携_実装計画.md`
- `convex/organizationBilling/policy.ts`
- `convex/organizationStripe/`
- `convex/organization/validators.ts`
- `convex/migrations/m018_organization_billing_business_to_pro.ts`
- `convex/schema.ts`
