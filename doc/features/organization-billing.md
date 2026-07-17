# グループ課金、複数店舗、複数管理者

## 機能説明

グループを契約と管理の境界とし、店舗を日常業務の選択単位として扱う。
同じグループの有効管理者は全店舗と契約操作を管理でき、人物と利用人数はグループ内で重複なく扱う。

## 仕様の正本

- 業務要件と受入条件は `doc/specs/organization-billing-business-flow.md` を正本とする。
- 実装順序、移行境界、外部ゲートは `doc/plans/2026-07-14_事業者課金_複数店舗_複数管理者_実装計画.md` を参照する。
- 既存グループへの無償Business付与は `doc/plans/2026-07-16_既存事業者_無償Business_実装計画.md` を参照する。
- 管理者5名上限、スタッフ詳細からの招待、Free管理者交代後の権限失効は `doc/plans/2026-07-17_スタッフ詳細_管理者招待_5名上限_実装計画.md` が先行計画を上書きする。
- この文書は現行コードの機能配置とAPI一覧を示し、料金や会計判断は定義しない。

## 主要な契約

- `organizations` が契約と管理の境界であり、`shops` はグループに属する操作対象である。
- `organizationPeople` がグループ内の人物を表し、スタッフ兼管理者でも利用人数を重複計上しない。
- `organizationMembers` が管理画面の権限を表し、`active`、`readOnly`、`removed` の状態を持つ。
- `readOnly`は契約制限中でも復旧操作を担う管理者に限り、管理者ではなくなった人物は`removed`にする。
- `organizationPeople`がグループの人物所属、`staffs`が店舗のスタッフ所属を表す。管理者権限を外しても、既存のスタッフ所属とシフト対象設定は変更しない。
- 管理者APIは認証済み利用者からグループ所属を解決し、選択された店舗が同じグループに属することをサーバー側で再確認する。
- 現在タブの店舗コンテキストは`?shop=`を正とする。URL値は`getMyShops`の候補と照合してから採用し、localStorageの選択店舗はURL指定がない場合の前回値fallbackとしてだけ使う。
- URLと保存値のどちらにも有効な店舗がなければ、候補数にかかわらず`getMyShops`の先頭店舗を自動採用する。明示されたURLが候補外の場合だけは別店舗へfallbackせず、汎用エラーを表示する。
- `organizationBillingStates` がグループ単位の課金状態を保持し、画面とmutationは共通policyから操作可否を導出する。
- 旧店舗モデルから移行し、移行元店舗との相互リンクを一意に確認でき、課金状態が未設定のグループは`complimentary.business`として、Stripeと接続せずBusinessの利用上限と有料機能を利用する。
- 管理者招待の発行では、本人確認後に管理者所属を作るための一回限りのアカウント連携権限と利用枠だけを予約する。新規人物、管理者所属、既存スタッフの管理者権限は作らない。
- 管理者招待は対象人物のLINE連携状態にかかわらずメールへ送る。再送では旧招待を失効させ、トークンをローテーションする。
- グループ設定の管理者招待Dialogは「現在のスタッフ」と「名前・メールを入力」の2タブで構成する。Freeでは現在のスタッフから次の管理者を選び、手入力による外部招待は行わない。
- グループ設定のユーザータブには管理者招待ボタンだけを置き、承認状況の一覧は表示しない。既存人物に未連携招待がある場合は、人物詳細または管理者招待Dialogからログイン案内を再送できる。
- `organizationInvitations.status`、`shops.operatingStatus`、`organizationBillingStates.freeShopId`は招待・課金ライフサイクルで引き続き使うため内部に保持する。物理削除は依存する状態遷移を置き換えた後のNarrowで行う。
- グループ設定では氏名とメールアドレスで外部人物を招待でき、人物詳細、スタッフ詳細、管理者招待Dialogのスタッフ選択では`targetPersonId`で固定した既存人物を招待する。有効な追加招待は`issued`の間から管理者枠を一枠予約する。
- 招待先が確認済みメールでログインすると、同じmutation内で利用者IDを人物へ紐づけ、`organizationMembers`を`active`にして招待を`linked`へ進める。認証済みの既存`users`があれば再利用し、招待先グループにいない外部人物はこの時点で初めて作る。
- Freeの管理者交代では、アカウント連携と同じトランザクションで旧管理者の管理画面権限と旧`shopMembers`だけを失効させる。`organizationPeople`と交代前からある`staffs`は維持し、未所属店舗へスタッフ行を追加しない。
- 店舗スタッフの編集は`organizationPeople`を正本とし、同じ人物の有効な全店舗スタッフ行へ氏名とメールアドレスを同期する。
- 店舗から人物を外してもグループ内の人物と利用人数算入は維持し、グループからの削除では全所属と未送信通知を失効する。
- 課金通知と招待通知は既存のNotification Outboxへ積み、外部送信前にグループ、所属、課金状態、通知起点の課金versionを再確認する。招待トークンはOutboxへ保存せず、送信直前に導出する。
- Free移行または契約制限開始前の業務操作から遅延して作られた通知も、通知起点のversionで判定して送信しない。
- メール通知は外部送信の直前に現在のグループ内の人物、スタッフ、または利用者のメールアドレスと宛先を照合し、変更前の宛先へ送信しない。
- 閲覧専用へ切り替わった画面は、開いていた書込ダイアログを閉じ、ShiftBoardの未保存編集を永続化済みデータへ戻す。

## 関連ファイル

### バックエンド

- `convex/schema.ts`：グループ、人物、管理者所属、招待、課金状態、監査、移行衝突のテーブル定義。
- `convex/_lib/functions.ts`：認証、グループ所属、選択店舗、課金状態を検証する管理者API wrapper。
- `convex/setup/mutations.ts`：グループ、最初の管理者、最初の店舗、Trial課金状態を一つの初期設定処理で作成。
- `convex/organization/`：グループ設定DTO、店舗操作、人物削除、認可、監査、利用状況集計。
- `convex/organizationBilling/`：プラン上限、操作policy、期限処理、Free選択、請求先メール、課金通知。
- `convex/organizationInvitation/`：管理者招待の発行、再送、取消、失効、公開プレビュー、アカウント連携、通知。
- `convex/notificationOutbox/`：グループ単位の通知scope、契約制限時の未送信業務通知停止、送信直前の再確認。
- `convex/migrations/m009_shops_to_organizations.ts`：既存店舗から一店舗一グループを作成。
- `convex/migrations/m010_shop_members_to_organization_members.ts`：既存店舗管理者をグループ内の人物と管理者所属へ移行。
- `convex/migrations/m011_staffs_to_organization_people.ts`：既存スタッフをグループ内の人物へ結び付け、曖昧な一致を衝突として記録。
- `convex/migrations/m012_organizations_add_complimentary_business.ts`：移行元店舗との対応を確認できるグループへ無償Businessを付与。
- `convex/migrations/m013_former_managers_remove_manager_access.ts`：交代済み旧管理者の由来を確認し、管理者所属だけを`removed`へ移行。
- `convex/migrations/m014_removed_organization_members_delete_legacy_shop_members.ts`：`removed`になった管理者の旧店舗管理権限を削除済みにする。
- `convex/migrations/m015_organization_invitations_link_lifecycle.ts`：旧`pending`を`issued`へ、旧`accepted`を`linked`へ移行し、連携者と招待時氏名を補完する。
- `convex/migrations/index.ts`：固定seriesと、旧管理者権限の衝突解消後にm013、m014だけを再評価する専用runnerを公開。
- `scripts/setupEnv.ts`：管理者招待の署名秘密値を含むサーバー環境変数をConvex環境へ同期。

### フロントエンド

- `src/routes/_auth/settings.tsx` と `src/pages/settings/`：グループ設定の取得、読み込み状態、画面全体の配置。
- `src/components/features/OrganizationSettings/`：グループ全体のユーザー一覧と詳細、店舗一覧と詳細、プランと支払いの表示UI、および操作ごとの送信、ダイアログ、最新権限を管理するcontroller。
- `src/components/features/ShopSwitcher/`：グループごとにまとめた店舗切り替え。
- `src/components/features/AuthenticatedApp/AuthGuard.tsx`：`?shop=`、前回値、利用可能店舗一覧を解決し、有効なAPI候補だけを店舗コンテキストへ同期する。
- `src/components/features/Dashboard/OperationContext/`：現在のグループと店舗を二枚のカードで表示し、複数候補だけを切り替え可能にする。
- `src/routes/manager-invite.tsx` と `src/components/features/ManagerInvitationAcceptance/`：公開招待プレビュー、認証導線、ログイン後の自動連携結果。
- `src/stores/shop/`：最後に確定した有効なグループと店舗の永続化、旧保存値の正規化、選択可否判定。
- `src/hooks/useShopQuery.ts`、`src/hooks/useShopPaginatedQuery.ts`、`src/hooks/useShopMutation.ts`：選択店舗を管理者APIへ渡すhook。
- `src/components/features/Dashboard/`：アーカイブ、プラン停止、閲覧のみ所属、契約制限、支払い確認中の店舗を閲覧専用で表示する。
- `src/components/features/Dashboard/StaffManagement/` と `StaffRoster/`：スタッフ詳細の管理者招待状態、確認、送信を管理する。
- `src/components/features/ShiftBoard/`：閲覧専用状態では保存と確定を停止し、状態遷移時に未保存編集を破棄する。

## 画面一覧

| 画面 | 役割 |
| --- | --- |
| `/settings?shop=<shopId>` | 指定店舗からグループを解決し、元の店舗へ戻るリンクとグループ名を表示する。複数グループ所属時だけグループを切り替え、ユーザー、管理者招待、店舗、現在のプラン、利用上限、支払い情報を扱う。タブは`tab` queryで保持する |
| 認証済みヘッダー | Dashboardとグループ設定以外で複数店舗がある場合に、現在のグループと店舗を表示して利用可能な店舗へ切り替える |
| `/manager-invite?token=...` | 招待先グループと期限を公開DTOで確認し、ログインまたは登録後に確認済みメールのアカウントを自動連携する |
| `/dashboard?shop=<shopId>` | グループと店舗のコンテキストカードを表示し、候補が複数ある場合だけ切り替える。店舗設定はモーダル、グループ設定は`/settings`へ進む |
| 各店舗業務画面 | `shop` queryを引き継ぎ、候補照合済みの選択店舗をAPIへ渡して、グループ所属と店舗境界の再検証後に既存データを扱う |

## Public API一覧

| API | 種別 | 用途 |
| --- | --- | --- |
| `api.setup.mutations.setupShopAndManager` | `authenticatedMutation` | グループ、管理者、最初の店舗、Trial課金状態を作成する |
| `api.dashboard.queries.getMyShops` | `authenticatedQuery` | 利用者が閲覧できる店舗をグループ情報と所属状態付きで返す |
| `api.dashboard.queries.getDashboardShop` | `managerQuery` | 店舗情報とグループ課金から導出した業務更新可否を返す |
| `api.dashboard.queries.getDashboardStaffs` | `managerQuery` | 店舗スタッフ、管理者状態、スタッフ詳細からの招待可否をページングして返す |
| `api.organization.queries.getSettings` | `managerQuery` | 選択店舗から所属グループを特定し、ユーザー、管理者招待と操作可否、店舗、課金の設定DTOを返す |
| `api.organization.mutations.updateOrganizationName` | `authenticatedMutation` | グループ所属と課金状態を確認してグループ名を変更する |
| `api.organization.mutations.addShop` | `authenticatedMutation` | 有料機能と上限を再確認して店舗を追加する |
| `api.organization.mutations.deleteShop` | `authenticatedMutation` | 対象店舗のグループ所属、管理者権限、確認ID、requestIdを再確認し、最後の店舗を除いて削除と後続cleanupを開始する |
| `api.organization.mutations.archiveShop` | `authenticatedMutation` | グループ所属と復旧権限を確認して店舗をアーカイブする |
| `api.organization.mutations.reactivateShop` | `authenticatedMutation` | グループ所属と店舗上限を確認して店舗を再稼働する |
| `api.organization.mutations.removePersonFromShop` | `authenticatedMutation` | 将来シフトを確認し、対象店舗のスタッフ所属とアクセスだけを終了する |
| `api.organization.mutations.removePersonFromOrganization` | `authenticatedMutation` | 最後の管理者、請求先、将来シフトを確認し、人物のグループ内アクセスを終了する |
| `api.organization.mutations.removeManagerRole` | `authenticatedMutation` | スタッフ所属を維持したまま管理者権限だけを外すか、所属のない人物のアクセスを終了する |
| `api.staff.mutations.editStaff` | `managerMutation` | グループ内の人物と同じ人物の有効な店舗スタッフ情報を同期する |
| `api.organizationInvitation.queries.getPreview` | 公開`query` | グループ名と期限だけを含む招待プレビューを返す |
| `api.organizationInvitation.mutations.create` | `authenticatedMutation` | メールアドレスで管理者招待を発行する旧互換API |
| `api.organizationInvitation.mutations.createExternal` | `authenticatedMutation` | 氏名とメールアドレスを招待へ保存し、人物を作らずに外部人物向けアカウント連携権限を発行する。同じメールの未連携招待がある場合は旧版を失効して再送し、既存利用者かどうかは招待発行時に判定しない |
| `api.organizationInvitation.mutations.createForPerson` | `authenticatedMutation` | グループ内の既存人物へアカウント連携権限を発行する。同じ人物に未連携招待がある場合は旧版を失効して再送する |
| `api.organizationInvitation.mutations.createForStaff` | `authenticatedMutation` | 選択店舗の既存スタッフを人物IDと現在のメールへ固定して招待する。同じ人物に未連携招待がある場合は旧版を失効して再送する |
| `api.organizationInvitation.mutations.resend` | `authenticatedMutation` | 現在の招待を失効させ、新しい招待を発行する |
| `api.organizationInvitation.mutations.revoke` | `authenticatedMutation` | 未連携招待を取り消して予約枠を解放する |
| `api.organizationInvitation.mutations.linkAccount` | `authenticatedMutation` | 確認済みメール、期限、最新性、所属、上限を再確認し、人物と利用者IDを紐づけて管理者所属を有効化する |
| `api.organizationInvitation.mutations.accept` | `authenticatedMutation` | 旧クライアント向けの互換API。内部では`linkAccount`と同じ連携処理を行い、成功結果を旧`accepted`形式へ変換する |
| `api.organizationBilling.mutations.setFreeSelection` | `authenticatedMutation` | Freeで残す管理者と店舗を保存し、契約制限中は再評価する。無償Businessでは拒否する |
| `api.organizationBilling.mutations.updateBillingEmail` | `authenticatedMutation` | 有効管理者または復旧担当者が請求先メールアドレスを変更する。無償Businessでは拒否する |
| `api.staffRegistration.mutations.submitRegistrationRequest` | 公開`mutation` | 稼働中店舗の公開登録リンクからスタッフ登録申請を作成する |
| `api.staffRegistration.mutations.approveRequest` | `managerMutation` | 最新の契約上限を確認し、予約枠を人物へ付け替えて申請を承認する |

すべてのpublic Convex functionは、runtimeの`args`と`returns` validatorを持つ。
クライアントが渡すグループID、店舗ID、人物IDは操作対象の指定であり、認可根拠には使わない。

## Internal API一覧

| API | 種別 | 用途 |
| --- | --- | --- |
| `internal.organizationBilling.mutations.processDeadline` | `internalMutation` | versionと期限を再確認し、Trial終了、猶予終了、期間末変更を適用する |
| `internal.organizationBilling.mutations.setStateFromVerifiedBilling` | `internalMutation` | 検証済みの外部課金結果だけをグループ課金状態へ反映する接続点 |
| `internal.organizationBilling.queries.getNotificationData` | `internalQuery` | 現在の課金状態と所属から課金メールの宛先を再解決する |
| `internal.organizationBilling.actions.enqueueBillingNotification` | `internalAction` | 課金メールを既存Notification Outboxへ重複排除付きで予約する |
| `internal.organizationInvitation.mutations.expire` | `internalMutation` | versionと期限が一致する`issued`招待だけを失効させる |
| `internal.organizationInvitation.queries.getEnqueueData` | `internalQuery` | 送信直前に招待、発行者、グループ、課金状態を再確認する |
| `internal.organizationInvitation.queries.getAcceptanceNotificationData` | `internalQuery` | アカウント連携完了通知のグループと有効管理者を再解決する |
| `internal.organizationInvitation.actions.enqueueManagerInvitation` | `internalAction` | 管理者招待メールをNotification Outboxへ重複排除付きで予約する |
| `internal.organizationInvitation.actions.enqueueAcceptanceNotifications` | `internalAction` | 連携者を含む全有効管理者へ連携完了メールを予約する |
| `internal.notificationOutbox.mutations.prepareForDelivery` | `internalMutation` | 外部送信直前にグループ、店舗、所属、課金状態を再確認する |
| `internal.notificationOutbox.mutations.prepareOrganizationManagerInvitationEmail` | `internalMutation` | 招待送信直前に有効性を確認し、生トークンを含まない表示情報を返す |
| `internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications` | `internalMutation` | Free移行または契約制限開始後に未送信の業務通知を停止する |
| `internal.migrations.index.run` | `internalMutation` | 登録済みmigrationを順番に実行する |
| `internal.migrations.index.runM012` | `internalMutation` | m012だけをdry runまたは衝突修復後に限定再実行する |
| `internal.migrations.index.runFormerManagerAccessCleanup` | `internalMutation` | m013とm014だけを順番に実行し、衝突裁定後も限定再評価する |
| `internal.organization.migrations.resolveFormerManagerAccessConflict` | `internalMutation` | 曖昧な旧管理者を固定理由で裁定し、権限失効または認可済み`readOnly`維持を監査する |

`m009`、`m010`、`m011`は`@convex-dev/migrations`の固定seriesから順番に実行する。

m012はWiden対応版をproductionへ反映するまで固定seriesへ登録せず、専用runnerも自動実行しない。

## 環境変数

- `ORGANIZATION_INVITATION_SIGNING_SECRET`：管理者招待トークンをHMAC-SHA-256で導出する32文字以上のサーバー側秘密値。

秘密値はブラウザへ公開せず、`.env`から`pnpm convex:env-setup`でConvex環境へ同期する。
秘密値を変更すると`issued`招待のトークンを検証できなくなるため、変更時は未連携招待を再発行する。

## プラン上限

| プラン | 利用人数上限 | 稼働店舗上限 | 有効管理者上限 |
| --- | ---: | ---: | ---: |
| Trial | 30 | 5 | 5 |
| Free | 4 | 1 | 1 |
| Pro | 15 | 5 | 5 |
| Business | 30 | 5 | 5 |
| 無償Business | 30 | 5 | 5 |

利用人数は、グループ内の有効なスタッフまたは有効管理者を人物単位で一度だけ数える。
`issued`招待は利用人数に含めず、新しい人物への招待が予約した枠を上限判定へ加える。

管理者上限は、activeな管理者と期限内の`issued`追加招待を合計して判定する。

Freeの管理者交代招待は管理者を入れ替えるため、追加枠を予約しない。

## 課金状態と操作可否

| 保存状態 | 利用権限 |
| --- | --- |
| `trial` | Trial上限で業務更新と有料機能を許可し、JST基準の終了期限を持つ |
| `initialPaymentPending` | 選択済み有料プランの権利を維持し、初回支払い結果を待つ |
| `pendingActivation` | 支払い成功を確認するまで保存済みのFreeまたは契約制限中の権限を継続し、有料権限は開放しない |
| `active.free` | Free上限で業務更新を許可し、複数店舗と複数管理者などの有料機能を拒否する |
| `active.pro`、`active.business` | 対応する上限で業務更新と有料機能を許可する |
| `complimentary.business` | Business上限で業務更新と有料機能を許可し、期限、支払い操作、課金通知を持たない |
| `scheduledChange` | 期限までは現在の有料プランを維持し、version付き期限処理で変更する |
| `grace` | 猶予期限までは元の有料プランを維持し、期限超過時に再確認して制限へ移す |
| `restricted` | 既存データの閲覧と、指定された復旧担当者による支払い、人物削除、店舗削除だけを許可する |

店舗状態は`active`、`archived`、`planSuspended`を区別する。
管理者所属は`active`、`readOnly`、`removed`を区別し、閲覧専用または削除済み所属から通常mutationを実行させない。

再契約または新規契約の支払い確認中を表す`pendingActivation`では、Freeまたは直前の`restricted`状態をversion付きsnapshotとして保持する。
Freeを保持している間はFreeの基本業務を継続でき、`restricted`を保持している間は閲覧と許可済みの復旧操作だけを継続できる。
支払い失敗時は保存済みsnapshotへ戻し、支払い成功が検証されるまで有料権限を開放しない。
期間末変更の取消は検証済み課金イベントだけを受け付け、予約前の有料プランへ戻す。
BusinessからProへの期間末変更は、`issued`招待の予約枠を含む利用状況が予約時点でPro上限内の場合だけ保存し、期限時にも再確認する。

## 移行状態

- schemaはWiden状態であり、既存行を受け入れるため一部のグループ参照と店舗状態をoptionalにしている。
- `m009`は店舗名やメールアドレスだけで別店舗を同じグループへ統合せず、一店舗一グループとして移行する。
- `m010`と`m011`は利用者ID、正規化済みメールアドレス、氏名を一意に確認できる場合だけ人物を再利用する。
- 同じ移行元店舗を示すグループ、同じグループと利用者の管理者所属、同じメールアドレスの人物が重複する場合は任意の一件を採用しない。
- `userId`付きの旧行は参照先ユーザーと人物の恒久IDを優先し、別ユーザーの同一メールや存在しないユーザーを自動統合しない。
- 推測で統合できない行は`organizationMigrationConflicts`へ識別可能な衝突として残す。
- 移行期間は`shopMembers`、`shopBillingStates`、旧スタッフ参照への最小限のfallbackと互換書き込みを残す。
- `m012`は`migrationSourceShopId`と店舗の相互リンクを確認でき、課金状態が未設定のグループだけに`complimentary.business`を作成する。
- `m012`は既存課金状態、重複課金状態、移行元markerの重複、リンク不整合を上書きせず、migration conflictとして記録する。
- `m013`はFree選択と交代監査から旧管理者だと一意に確認できる`readOnly`だけを`removed`へ変更し、スタッフ所属とスタッフ向け通知を維持する。
- `m014`はcanonicalな管理者所属が`removed`であることを一意に確認できる旧`shopMembers`だけを削除済みにする。
- m013とm014で由来や対応が曖昧な行は自動変更せず、migration conflictとして手動裁定へ回す。
- production exportのZIPは、実行前を`pnpm convex:verify-complimentary-export -- --mode pre --path <export.zip>`、実行後を`pnpm convex:verify-complimentary-export -- --mode post --path <export.zip> --expected-target-count <preの件数> --expected-target-set-sha256 <preのhash>`で展開せずにオフライン検証する。対象0件、pre/postの対象集合差分、重複、リンク、課金状態、監査、未解消conflictの対応が崩れている場合はmigrationを進めない。
- export検証はmigration componentのstatusを証明しない。developとproductionで別途`lib:getStatus`を確認し、m012が`isDone: true`かつ`state: "success"`であることを完走条件にする。
- production snapshotには既存ファイルを掃除・上書きする`pnpm convex:save`を使わず、Dashboard backupまたは保存先を明示した`convex export`を使う。

## 外部ゲートと対象外

| 項目 | 状態 |
| --- | --- |
| ProとBusinessの料金、税、請求周期、日割り、返金、未払い請求書 | 未決定であり、この実装では推測しない |
| 既存本番利用者へ割り当てる初期課金状態 | `migrationSourceShopId`があるグループへ、期限と課金のない`complimentary.business`を付与することを決定済み |
| Stripe Product、Price、Webhook endpoint、Customer Portal | 外部設定を作成していない |
| Stripe Checkout、Customer Portal、Webhook、Customer同期 | 外部設定と会計判断が揃うまで接続しない |
| 本番migration | migrationコードだけを実装し、本番データへは実行していない |
| 本番デプロイ | この実装では実行していない |
| Narrow | 本番相当環境で新モデルの安定を観測するまで実行しない |
| 旧課金データと履歴の物理削除 | 保持期間、対象件数、復旧手段が決まるまで実行しない |

`setStateFromVerifiedBilling`は将来のStripe連携が検証済み結果を渡すための内部接続点であり、現在のコードがStripeとの通信や署名検証を行うことを意味しない。

## テスト配置

- `convex/organization/*.test.ts`：グループ境界、店舗操作、人物削除、最後の管理者、冪等性。
- `convex/organizationBilling/*.test.ts`：上限、利用人数、JST境界、状態遷移、期限処理、通知。
- `convex/organizationInvitation/mutations.test.ts`と`token.test.ts`：発行時の人物未作成、トークン、期限、メール一致、再送ローテーション、アカウント連携、上限、競合、通知。
- `convex/organizationInvitation/lifecycleMigration.test.ts`：旧`pending/accepted`から`issued/linked`への移行と再実行時の冪等性。
- `convex/organization/freeFormerManagerAccessMigration.test.ts`：旧管理者権限移行、衝突、裁定、再実行、スタッフ所属の不変性。
- `convex/_scenario/staffManagerInvitation.test.ts`：既存スタッフの招待から管理者化までの状態遷移。
- `convex/_scenario/organizationManagerExchange.test.ts`：Free管理者交代後の権限失効、スタッフ継続、通知対象の不変性。
- `convex/_scenario/organizationBillingLifecycle.test.ts`：複数APIと時間経過をまたぐ課金ライフサイクル。
- `convex/organization/migrations.test.ts`：m012の対象限定、衝突記録、監査、再実行の冪等性。
- `convex/dashboard/queries.test.ts`：一人の利用者が複数グループへ所属する場合の店舗候補DTO。
- `src/components/features/AuthenticatedApp/shopContextResolver.test.ts` と `AuthGuard.test.tsx`：URL、前回値、自動fallback、明示URL不正時の解決境界。
- `src/components/features/Dashboard/OperationContext/` のLogic UTとStory：候補数による静的表示・切り替え、設定導線、PC/SPの代表状態。
- `src/components/features/OrganizationSettings/index.stories.tsx`：グループ設定の代表状態と操作後の状態。
- `src/components/features/ManagerInvitationAcceptance/index.stories.tsx`：招待プレビューとアカウント連携結果。
- `src/components/features/ShopSwitcher/index.stories.tsx`：Dashboard以外でのグループと店舗の切り替え。
