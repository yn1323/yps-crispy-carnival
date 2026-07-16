# 店舗単位管理者所属の移行互換

この文書名は既存リンクを維持するために残している。
現在の事業者所属と店舗選択は[事業者課金、複数店舗、複数管理者](organization-billing.md)を参照する。

## 現行仕様

- `organizationMembers`が事業者単位の管理者所属を表し、有効管理者は同じ事業者の全店舗を管理する。
- `shops.organizationId`が店舗の事業者を表し、管理者APIは認証済み利用者の事業者所属と選択店舗をサーバー側で検証する。
- `getMyShops`は利用可能な店舗を事業者名、店舗状態、所属状態付きで返す。
- 認証済みヘッダーの店舗切り替えと`/shop-select`は、店舗を事業者ごとにまとめて表示する。
- `selectedShopAtom`は現在の事業者と店舗を保持し、管理者向けhookが選択店舗をAPIへ渡す。

## 移行互換

- `shopMembers`は`m010_shop_members_to_organization_members`の完了と新クライアントの配布を確認するまでfallbackと互換書き込みに使う。
- `shops.organizationId`と`shops.operatingStatus`はWiden期間中だけoptionalであり、`m009_shops_to_organizations`の本番完了と観測後にNarrowする。
- 本番migration、Narrow、旧所属データの物理削除は今回の実装で実行しない。

## 参考ファイル

- `doc/features/organization-billing.md`
- `convex/_lib/functions.ts`
- `convex/dashboard/queries.ts`
- `convex/migrations/m009_shops_to_organizations.ts`
- `convex/migrations/m010_shop_members_to_organization_members.ts`
- `src/components/features/ShopSwitcher/`
- `src/components/features/ShopSelection/`
- `src/stores/shop/`
