# 店舗単位の請求管理者ロールに関する旧検討

この文書名は既存リンクを維持するために残している。
現在の権限と招待の契約は[事業者課金、複数店舗、複数管理者](organization-billing.md)と[業務フロー](../specs/organization-billing-business-flow.md)を参照する。

## 現行仕様との違い

- `billingManager`は採用せず、事業者の全有効管理者へ店舗管理と契約操作の同じ権限を与える。
- 管理者権限は店舗ごとの`shopMembers.role`ではなく、事業者単位の`organizationMembers`で管理する。
- 管理者所属は`active`、`readOnly`、`removed`を区別し、最後の有効管理者と最後の復旧担当者を失う操作を拒否する。
- 管理者招待は既存スタッフだけに限定せず、事業者設定で指定したメールアドレスへメールだけで送る。
- 招待URLは`/manager-invite?token=...`であり、有効期限は発行から7日間である。
- 招待トークンはdigestだけを保存し、確認済みメールアドレスの一致、単回利用、再送時の旧招待失効、利用上限を承認時に再確認する。
- Stripe CheckoutとCustomer Portalは未接続であり、外部設定と会計判断が揃うまで請求権限の実装根拠にしない。

## 参考ファイル

- `doc/features/organization-billing.md`
- `doc/specs/organization-billing-business-flow.md`
- `convex/organization/validators.ts`
- `convex/organizationInvitation/`
- `src/components/features/ManagerInvitationAcceptance/`
