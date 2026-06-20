# 課金プラン管理

店舗単位で課金プラン状態を管理し、有料ユーザー向け機能を安全に出し分けるための土台。現時点ではStripe連携、料金ページ、ユーザー向けのプラン表示、スタッフ数上限の強制は未実装。

## 関連ファイル

- `convex/schema.ts` — `shopBillingStates` と `by_shopId` index
- `convex/billing/service.ts` — プラン定義、entitlements計算、有料機能guard
- `convex/setup/mutations.ts` — 新規店舗作成時の `free` 課金状態作成
- `convex/migrations/m005_shop_billing_states_backfill_free.ts` — 既存店舗への `free` 課金状態バックフィル
- `convex/migrations/index.ts` — migration runner登録

## プラン

| planKey | 表示名 | 有料機能 | スタッフ上限 |
|---|---|---|---:|
| `free` | フリー | 利用不可 | 10 |
| `standard` | スタンダード | 利用可 | 20 |
| `premium` | プレミアム | 利用可 | 30 |

スタッフ上限は料金設計のメタデータとして定義しているが、課金機能公開前のためまだ強制しない。既存店舗はスタッフ数に関係なくそのまま利用できる。

## 判定方針

有料機能をConvex側で実装するときは、画面やmutation内で `planKey` を直接判定しない。必ず `convex/billing/service.ts` の `requirePaidFeature(ctx, shopId)` または `getShopEntitlements(ctx, shopId)` を使う。

`shopBillingStates` が存在しない店舗は互換性のため `free` として扱う。migration完了後は原則として1店舗につき1行を持つ。

## 今回やらないこと

- Stripe Checkout / Customer Portal
- Stripe Webhook同期
- `shopSubscriptions` / `stripeWebhookEvents`
- 手動override専用テーブル
- Dashboardや店舗設定でのプラン表示
- スタッフ追加・参加申請承認時の人数上限チェック

Stripe連携時は、Stripe上の契約状態とシフトリ上の利用権限を分ける。画面・APIは契約状態ではなく `getShopEntitlements` の結果を使う。
