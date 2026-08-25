# 店舗単位管理者所属の移行互換

この文書名は既存リンクを維持するために残している。
現在の組織所属と店舗選択は[組織課金、複数店舗、複数管理者](organization-billing.md)を参照する。

複数組織、複数店舗、複数管理者は通常の画面とpublic mutationから利用できる。
既存E2E契約は、専用Preview deploymentで認証、組織境界、上限、招待token lifecycleを検証する。

## 現行仕様

- `organizationMembers`が組織単位の管理画面権限を表し、有効管理者は同じ組織の全店舗を管理する。
- `organizationPeople`が組織内の人物、`staffs`が店舗のスタッフ所属を表す。管理者権限を失効しても、この二つをスタッフ所属として維持する。
- active管理者人物と、移行完了前に残る旧`readOnly`所属の人物も、個別店舗または全店舗のスタッフ所属を解除できる。
  個別解除では対象店舗のstaff所属だけを終了してほかの店舗所属を維持し、全店舗解除でも組織人物と管理者権限を維持する。
- active管理者人物と旧`readOnly`所属の人物を組織から削除する場合は、先に管理者権限を外す。
  最後のactive管理者の権限は外せず、店舗・組織全体の削除cleanupは個別人物操作と分けて扱う。
- 現行フローが作成する管理者所属は`active`だけで、`readOnly`は移行完了前の旧保存値としてのみ読み取る。管理者交代やFree適用で管理者ではなくなった人物は`removed`にする。
- `shops.organizationId`が店舗の組織を表し、管理者APIは認証済み利用者の組織所属と選択店舗をサーバー側で検証する。
- `getMyShops`は利用可能な店舗を組織名、店舗状態、所属状態付きで返し、`removed`になった人物へ当該組織の店舗を返さない。
- `/dashboard`は`org`で検証した一つの組織だけを表示し、`shop`はその組織のactive店舗から選ぶ。  URLで有効な店舗、現在組織の保存済みhint、active店舗の先頭の順に解決し、名称や人物情報はbrowser storageへ保存しない。
- `/manage`と`/manage/organization`は、検証済みの`org`を組織authorityとして使う。  組織全体のread/writeに先頭店舗やHome店舗を要求せず、canonicalな組織所属がない利用者を旧`shopMembers`だけで通さない。
- 管理者一覧、管理者招待、課金画面は認証済み管理者へ公開する。  direct accessとpublic mutation/actionは同じ認証、組織境界、管理者状態、契約状態をserver-sideで確認する。
- `/dashboard`の店舗query・mutationは、画面で解決した`shopId`と`expectedOrganizationId`を同時に渡す。  URLと保存済み店舗を認可根拠にせず、管理者APIが店舗所属と組織所属の一致を再検証する。
- `/dashboard`でactive店舗がない場合は、店舗作成を自動開始せず管理画面への回復導線を表示する。組織または店舗の切替中は、旧店舗のquery結果と開いていたDialogを次のscopeへ持ち越さない。
- URL指定がない場合は、有効な保存済み店舗、`getMyShops`の先頭候補の順で自動決定し、URLを正規化する。
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
- `src/components/features/AuthenticatedApp/AppOrganizationScope/`
- `src/components/features/AuthenticatedApp/AppOrganizationSwitcher/`
- `src/components/features/AuthenticatedApp/appOrganizationSwitchTarget.ts`
- `src/components/features/Dashboard/OperationContext/`
- `src/pages/dashboard/`
