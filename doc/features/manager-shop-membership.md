# 店舗単位管理者所属の移行互換

この文書名は既存リンクを維持するために残している。
現在の組織所属と店舗選択は[組織課金、複数店舗、複数管理者](organization-billing.md)を参照する。

## 現行仕様

- `organizationMembers`が組織単位の管理画面権限を表し、有効管理者は同じ組織の全店舗を管理する。
- `organizationPeople`が組織内の人物、`staffs`が店舗のスタッフ所属を表す。管理者権限を失効しても、この二つをスタッフ所属として維持する。
- activeまたはreadOnlyの管理者人物も、個別店舗または全店舗のスタッフ所属を解除できる。
  個別解除では対象店舗のstaff所属だけを終了してほかの店舗所属を維持し、全店舗解除でも組織人物と管理者権限を維持する。
- activeまたはreadOnlyの管理者人物を組織から削除する場合は、先に管理者権限を外す。
  最後のactive管理者の権限は外せず、店舗・組織全体の削除cleanupは個別人物操作と分けて扱う。
- `readOnly`は契約制限中でも復旧操作を担う管理者に限る。管理者交代やFree適用で管理者ではなくなった人物は`removed`にする。
- `shops.organizationId`が店舗の組織を表し、管理者APIは認証済み利用者の組織所属と選択店舗をサーバー側で検証する。
- `getMyShops`は利用可能な店舗を組織名、店舗状態、所属状態付きで返し、`removed`になった人物へ当該組織の店舗を返さない。
- Dashboardは現在の組織名を組織設定への上位リンクとして表示し、その下に現在店舗を表示する。複数組織に所属する場合は組織Accordion内に別組織への変更行を並べ、選んだ組織の名称順先頭店舗へ切り替える。店舗候補が複数ある場合は店舗セレクターからも切り替えられる。Dashboard以外の認証済み画面では、複数店舗がある場合だけヘッダーから切り替えられる。
- 現在タブの店舗は`?shop=`を正とし、`selectedShopAtom`は最後に確定した有効な店舗をlocalStorageへ保持するfallbackとして扱う。
- 別タブのlocalStorage更新は実行中の選択状態へ反映せず、各タブの`?shop=`を維持する。
- URL指定がない場合は、有効な保存済み店舗、`getMyShops`の先頭候補の順で自動決定し、URLを正規化する。候補が複数でも専用選択画面は表示しない。
- URLに明示された店舗が候補外なら別店舗へfallbackせず、店舗スコープの子画面を描画しない汎用エラーを表示する。
- URLとlocalStorageは認可根拠にせず、候補照合後の店舗だけを管理者向けhookへ渡し、管理者APIでも所属と店舗境界を再検証する。
- 購読更新で保存済み店舗の管理権限が消えた場合は、選択状態を正規化するまで旧店舗の子画面を描画しない。

## 移行互換

- 新しい管理者所属は`organizationMembers`だけへ保存し、`shopMembers`への互換書き込みは行わない。
- `shopMembers`は、canonical所属がまだない利用者を移行中も締め出さないためのread fallbackとしてだけ使う。canonical所属が1件でもあれば、状態にかかわらず旧所属を認可根拠にしない。
- `m029_shop_members_narrow_prep`は、canonical所属と一意に対応するactiveな旧所属を論理削除する。  権限を変えるため固定seriesには含めず、dry run、m025からm028のstatus、readiness、未解消conflict 0件を確認したdeploymentだけで専用runnerを明示実行する。  未移行または対応が曖昧な旧所属は削除せず、migration conflictへ記録する。
- 管理者交代では対応する旧`shopMembers`も削除済みにし、legacy fallbackから管理権限が復活しないようにする。
- `m013_former_managers_remove_manager_access`と`m014_removed_organization_members_delete_legacy_shop_members`は、既存の交代済み旧管理者にも同じ権限失効を適用する。
- `shops.organizationId`と`shops.operatingStatus`はWiden期間中だけoptionalである。対象deploymentで`m009_shops_to_organizations`の完走と互換readの安定を確認した後にだけNarrowする。
- 固定seriesへの登録から実環境でのmigration完了、Narrow、旧所属データの物理削除を推測しない。対象deploymentの確認結果は[リリース状態](../manual/release-status.md)を参照する。

## 参考ファイル

- `doc/features/organization-billing.md`
- `convex/_lib/functions.ts`
- `convex/dashboard/queries.ts`
- `convex/migrations/m009_shops_to_organizations.ts`
- `convex/migrations/m010_shop_members_to_organization_members.ts`
- `convex/migrations/m025_shops_narrow_prep.ts`
- `convex/migrations/m026_shop_members_narrow_prep.ts`
- `convex/migrations/m027_staffs_narrow_prep.ts`
- `convex/migrations/m029_shop_members_narrow_prep.ts`
- `convex/migrations/m013_former_managers_remove_manager_access.ts`
- `convex/migrations/m014_removed_organization_members_delete_legacy_shop_members.ts`
- `convex/narrowReadiness/queries.ts`
- `src/components/features/AuthenticatedApp/AuthGuard.tsx`
- `src/components/features/Dashboard/OperationContext/`
- `src/components/features/ShopSwitcher/`
- `src/stores/shop/`
