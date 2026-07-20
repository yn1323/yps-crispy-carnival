# 店舗単位の請求管理者ロールに関する旧検討

この文書名は既存リンクを維持するために残している。
現在の権限と招待の契約は[グループ課金、複数店舗、複数管理者](organization-billing.md)と[業務フロー](../specs/organization-billing-business-flow.md)を参照する。

## 現行仕様との違い

- `billingManager`は採用せず、グループの全有効管理者へ店舗管理と契約操作の同じ権限を与える。
- 管理者権限は店舗ごとの`shopMembers.role`ではなく、グループ単位の`organizationMembers`で管理する。
- 管理者所属は`active`、`readOnly`、`removed`を区別し、最後の有効管理者と最後の復旧担当者を失う操作を拒否する。
- `readOnly`は契約制限中の復旧担当者など、管理者関係を維持する人物に限る。管理者ではなくなった人物は`removed`にする。
- グループ設定では氏名とメールアドレスで外部の新規人物を招待でき、人物詳細またはスタッフ詳細では既存人物を人物IDへ固定して招待できる。
- 招待発行時は一回限りのアカウント連携権限と利用枠だけを予約する。外部の新規人物、管理者所属、既存スタッフの管理者権限は作らない。
- 外部の新規人物は招待フォームへ同じ氏名とメールアドレスを再入力して再送する。既存人物は人物詳細またはスタッフ詳細から再送し、どちらも旧招待を失効させてトークンをローテーションする。
- Trial、Pro、Pro（先行登録特典）では、active管理者と期限内の`issued`追加招待を合わせてグループ全体で5名までとする。Freeは管理者1名を維持し、既存スタッフとの交代だけを許可する。
- 招待先が確認済みメールでログインすると、人物と利用者IDを紐づけ、管理者所属を有効化して招待を`linked`へ進める。
- Free管理者交代では、アカウント連携と同じトランザクションで旧管理者の管理画面権限を失効させるが、グループ人物と既存店舗のスタッフ所属、シフト対象設定は維持する。
- 招待URLは`/manager-invite?token=...`であり、有効期限は発行から7日間である。
- 招待トークンはdigestだけを保存し、生トークンは通知送信の直前に導出する。確認済みメールアドレスの一致、招待の最新性、利用上限はアカウント連携時に再確認する。
- `linkAccount`が現行の連携APIであり、`accept`は旧クライアント向けの互換APIとして残す。
- ProのCheckout、Customer Portal、期間末のFree変更は、専用の請求管理者を設けず、対象グループの全有効管理者へ同じ権限を与える。
- 契約制限中は、記録された復旧担当者に支払い復旧に必要な操作だけを許可する。
- Pro（先行登録特典）にはCheckout、Customer Portal、契約変更を表示せず、Stripeオブジェクトを作成しない。
- 価格と会計判断が未確定の間は`STRIPE_BILLING_MODE=off`とし、Stripeの新しいユーザー操作を利用不可にする。
- APIキー、Webhook署名シークレット、Price ID、Portal Configuration IDの実値は、実装と検証の完了後に利用者が登録する。

## 参考ファイル

- `doc/features/organization-billing.md`
- `doc/specs/organization-billing-business-flow.md`
- `doc/plans/2026-07-20_Stripe課金連携_実装計画.md`
- `convex/organization/validators.ts`
- `convex/organizationStripe/`
- `convex/organizationInvitation/`
- `src/components/features/ManagerInvitationAcceptance/`
- `src/components/features/Dashboard/StaffManagement/`
- `src/components/features/Dashboard/StaffRoster/`
