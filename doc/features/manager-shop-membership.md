# 店舗単位管理者所属の移行互換

この文書名は既存リンクを維持するために残している。
現在のグループ所属と店舗選択は[グループ課金、複数店舗、複数管理者](organization-billing.md)を参照する。

## 現行仕様

- `organizationMembers`がグループ単位の管理画面権限を表し、有効管理者は同じグループの全店舗を管理する。
- `organizationPeople`がグループ内の人物、`staffs`が店舗のスタッフ所属を表す。管理者権限を失効しても、この二つをスタッフ所属として維持する。
- `readOnly`は契約制限中でも復旧操作を担う管理者に限る。管理者交代やFree適用で管理者ではなくなった人物は`removed`にする。
- `shops.organizationId`が店舗のグループを表し、管理者APIは認証済み利用者のグループ所属と選択店舗をサーバー側で検証する。
- `getMyShops`は利用可能な店舗をグループ名、店舗状態、所属状態付きで返し、`removed`になった人物へ当該グループの店舗を返さない。
- Dashboardは現在のグループと店舗を二枚のコンテキストカードで表示し、候補が複数あるカードだけを切り替え操作にする。Dashboard以外の認証済み画面では、複数店舗がある場合だけヘッダーから切り替えられる。
- 現在タブの店舗は`?shop=`を正とし、`selectedShopAtom`は最後に確定した有効な店舗をlocalStorageへ保持するfallbackとして扱う。
- 別タブのlocalStorage更新は実行中の選択状態へ反映せず、各タブの`?shop=`を維持する。
- URL指定がない場合は、有効な保存済み店舗、`getMyShops`の先頭候補の順で自動決定し、URLを正規化する。候補が複数でも専用選択画面は表示しない。
- URLに明示された店舗が候補外なら別店舗へfallbackせず、店舗スコープの子画面を描画しない汎用エラーを表示する。
- URLとlocalStorageは認可根拠にせず、候補照合後の店舗だけを管理者向けhookへ渡し、管理者APIでも所属と店舗境界を再検証する。
- 購読更新で保存済み店舗の管理権限が消えた場合は、選択状態を正規化するまで旧店舗の子画面を描画しない。

## 移行互換

- `shopMembers`は`m010_shop_members_to_organization_members`の完了と新クライアントの配布を確認するまでfallbackと互換書き込みに使う。
- 管理者交代では対応する旧`shopMembers`も削除済みにし、legacy fallbackから管理権限が復活しないようにする。
- `m013_former_managers_remove_manager_access`と`m014_removed_organization_members_delete_legacy_shop_members`は、既存の交代済み旧管理者にも同じ権限失効を適用する。
- `shops.organizationId`と`shops.operatingStatus`はWiden期間中だけoptionalであり、`m009_shops_to_organizations`の本番完了と観測後にNarrowする。
- 本番migration、Narrow、旧所属データの物理削除は今回の実装で実行しない。

## 参考ファイル

- `doc/features/organization-billing.md`
- `convex/_lib/functions.ts`
- `convex/dashboard/queries.ts`
- `convex/migrations/m009_shops_to_organizations.ts`
- `convex/migrations/m010_shop_members_to_organization_members.ts`
- `convex/migrations/m013_former_managers_remove_manager_access.ts`
- `convex/migrations/m014_removed_organization_members_delete_legacy_shop_members.ts`
- `src/components/features/AuthenticatedApp/AuthGuard.tsx`
- `src/components/features/Dashboard/OperationContext/`
- `src/components/features/ShopSwitcher/`
- `src/stores/shop/`
