# 店舗単位課金プランの旧検討

この文書名は既存リンクを維持するために残している。
現在の課金契約はグループ単位であり、実装と業務判断は[グループ課金、複数店舗、複数管理者](organization-billing.md)と[業務フロー](../specs/organization-billing-business-flow.md)を参照する。

## 現行仕様との違い

- `shopBillingStates`の`free`、`standard`、`premium`は、分析と旧読み取りの互換性を保つために残した旧モデルである。
- 新しい課金状態の正本は`organizationBillingStates`であり、Trial、Free、Pro、Business、支払い猶予、契約制限を一つの状態unionで表す。
- プラン上限と操作可否は`convex/organizationBilling/policy.ts`から導出する。
- ProとBusinessの料金、税、請求周期、日割り、返金は未決定であり、この文書の旧プラン名や上限を料金判断に使わない。
- Stripe連携、本番migration、Narrow、旧課金データの物理削除は外部ゲートとして分離している。

## 参考ファイル

- `doc/features/organization-billing.md`
- `doc/specs/organization-billing-business-flow.md`
- `convex/organizationBilling/policy.ts`
- `convex/organization/validators.ts`
- `convex/schema.ts`
