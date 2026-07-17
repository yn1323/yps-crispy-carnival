# 店舗単位の請求管理者ロールに関する旧検討

この文書名は既存リンクを維持するために残している。
現在の権限と招待の契約は[グループ課金、複数店舗、複数管理者](organization-billing.md)と[業務フロー](../specs/organization-billing-business-flow.md)を参照する。

## 現行仕様との違い

- `billingManager`は採用せず、グループの全有効管理者へ店舗管理と契約操作の同じ権限を与える。
- 管理者権限は店舗ごとの`shopMembers.role`ではなく、グループ単位の`organizationMembers`で管理する。
- 管理者所属は`active`、`readOnly`、`removed`を区別し、最後の有効管理者と最後の復旧担当者を失う操作を拒否する。
- `readOnly`は契約制限中の復旧担当者など、管理者関係を維持する人物に限る。管理者ではなくなった人物は`removed`にする。
- グループ設定では指定したメールアドレスへ招待でき、スタッフ詳細では既存スタッフを人物IDへ固定して招待できる。
- スタッフ詳細からの招待先はサーバーが現在の人物メールから解決し、メール変更後の再招待では古い招待を同じ処理で失効させる。
- Trial、Pro、Business、無償Businessでは、active管理者と期限内の追加招待を合わせてグループ全体で5名までとする。Freeは管理者1名を維持し、既存スタッフとの交代だけを許可する。
- Free管理者交代の承認後は旧管理者の管理画面権限を失効させるが、グループ人物と既存店舗のスタッフ所属、シフト対象設定は維持する。
- 招待URLは`/manager-invite?token=...`であり、有効期限は発行から7日間である。
- 招待トークンはdigestだけを保存し、確認済みメールアドレスの一致、単回利用、再送時の旧招待失効、利用上限を承認時に再確認する。
- Stripe CheckoutとCustomer Portalは未接続であり、外部設定と会計判断が揃うまで請求権限の実装根拠にしない。

## 参考ファイル

- `doc/features/organization-billing.md`
- `doc/specs/organization-billing-business-flow.md`
- `convex/organization/validators.ts`
- `convex/organizationInvitation/`
- `src/components/features/ManagerInvitationAcceptance/`
- `src/components/features/Dashboard/StaffManagement/`
- `src/components/features/Dashboard/StaffRoster/`
