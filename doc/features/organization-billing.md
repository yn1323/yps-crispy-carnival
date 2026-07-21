# グループ課金、複数店舗、複数管理者

## 機能説明

グループを契約と管理の境界とし、店舗を日常業務の選択単位として扱う。
同じグループの有効管理者は全店舗と契約操作を管理でき、人物と利用人数はグループ内で重複なく扱う。

## 仕様の正本

- 業務要件と受入条件は `doc/specs/organization-billing-business-flow.md` を正本とする。
- Business再導入、利用上限、Stripeプラン変更、m021、人物削除は `doc/plans/2026-07-21_課金プラン改定_Business再導入_実装計画.md` を参照する。
- `doc/plans/2026-07-20_Stripe課金連携_実装計画.md` はStripe連携の基礎設計と履歴を示す。
  Business廃止、Pro 30名、支払い不要Pro、新規グループを支払い不要Proとする記述は、2026-07-21の計画と現行実装が上書きする。
- `doc/plans/2026-07-14_事業者課金_複数店舗_複数管理者_実装計画.md` と `doc/plans/2026-07-16_既存事業者_無償Business_実装計画.md` のプラン構成と上限は上書き済みであり、移行履歴の確認にだけ使う。
- 管理者5名上限、既存人物への管理者招待、Free管理者交代後の権限失効は `doc/plans/2026-07-17_スタッフ詳細_管理者招待_5名上限_実装計画.md` が先行計画を上書きする。
- Free管理者交代の送信前確認と、同一管理者による複数グループ切替のE2E契約は `doc/plans/2026-07-18_Free管理者交代_複数グループ_追加実装計画.md` を参照する。
- 店舗とグループの利用停止、業務識別情報の保持、LINE IDの切断は `doc/features/data-deletion.md` と `doc/plans/2026-07-19_削除後の業務識別情報保持と認証切り離し_実装計画.md` を参照する。
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
- 同じアカウントが無関係な複数グループの有効管理者である場合も、`?shop=`からグループを一意に解決し、Dashboardとグループ設定の切替、表示、更新を選択グループへ限定する。
- `organizationBillingStates` がグループ単位の課金状態を保持し、画面とmutationは共通policyから操作可否を導出する。
- グループ名は課金状態にかかわらず、有効管理者が変更できる。`readOnly`の管理者と、選択店舗からグループ所属を解決できない利用者には許可しない。
- 請求先メール変更は正規化メールをserver-sideのsemantic identityとする。同じ正規化メールへ異なるrequest IDで再実行しても`changed: false`を返し、監査、課金通知、Stripe同期jobを増やさない。
- 新規初期設定で作成するグループは`complimentary.business`として開始し、期限と利用料金なしでBusiness機能を利用する。
- 旧店舗モデルから移行した対象グループは、m012とm018の履歴を経て、m021で`complimentary.pro`から`complimentary.business`へ移行する。
- `complimentary.business`は40名、5店舗、管理者5名の上限を持つが、Stripe Customer、Subscription、Checkout Session、Portal Session、Invoice、Subscription Schedule、課金operation、課金通知を作らない。
- 支払い不要Businessは、公開API、管理用処理、Stripeイベント、再同期処理から通常課金または別の課金状態へ変更しない。
- 通常課金の請求周期はグループごとのStripe Subscriptionが保持し、月初には揃えない。
  Convexはprovider再取得を通過した期間開始、期間終了、請求基準日のsnapshotだけを保持する。
- ProからBusinessへは、同じSubscription ItemをBusiness Priceへ即時変更し、Stripeが算出した残期間の差額を日割り請求する。
  支払い成功を確認するまではProの利用権限を維持する。
- BusinessからProへは、Stripe Subscription Scheduleで現在の期間末への変更を予約する。
  期間末にproviderの変更と請求成功を確認してからProへ進め、失敗時はBusinessの猶予状態へ進める。
- 管理者招待の発行では、本人確認後に管理者所属を作るための一回限りのアカウント連携権限と利用枠だけを予約する。新規人物、管理者所属、既存スタッフの管理者権限は作らない。
- 管理者招待は対象人物のLINE連携状態にかかわらずメールへ送る。再送では旧招待を失効させ、トークンをローテーションする。
- グループ設定の管理者招待Dialogは「現在のスタッフ」と「名前・メールを入力」の2タブで構成する。Freeでは現在のスタッフから次の管理者を選び、手入力による外部招待は行わない。
- Freeの管理者交代では、初回送信と再送の前に、後任がこのグループの唯一の管理者になり、アカウント連携完了時に現管理者の管理者権限が終了することを現管理者へ明示する。最終確認までは招待mutationを実行しない。
- グループ設定のユーザータブには管理者招待ボタンだけを置き、承認状況の一覧は表示しない。既存人物に未連携招待がある場合は、ユーザー詳細ページまたは管理者招待Dialogからログイン案内を再送できる。
- `organizationInvitations.status`、`shops.operatingStatus`、`organizationBillingStates.freeShopId`は招待・課金ライフサイクルで引き続き使うため内部に保持する。物理削除は依存する状態遷移を置き換えた後のNarrowで行う。
- グループ設定では氏名とメールアドレスで外部人物を招待でき、ユーザー詳細ページと管理者招待Dialogのスタッフ選択では`targetPersonId`で固定した既存人物を招待する。有効な追加招待は`issued`の間から管理者枠を一枠予約する。
- 招待先が確認済みメールでログインすると、同じmutation内で利用者IDを人物へ紐づけ、`organizationMembers`を`active`にして招待を`linked`へ進める。認証済みの既存`users`があれば再利用し、招待先グループにいない外部人物はこの時点で初めて作る。
- アカウント連携完了通知のグループ設定CTAは、送信時点で対象グループの削除されていない代表店舗を`active`、`planSuspended`、`archived`の順に再解決し、`/settings?shop=<shopId>`へ遷移する。代表店舗がなければ別グループの店舗へfallbackせず、`/settings`に限定する。
- Freeの管理者交代では、アカウント連携と同じトランザクションで旧管理者の管理画面権限と旧`shopMembers`だけを失効させる。`organizationPeople`と交代前からある`staffs`は維持し、未所属店舗へスタッフ行を追加しない。
- 店舗スタッフの編集は`organizationPeople`を正本とし、同じ人物の有効な全店舗スタッフ行へ氏名とメールアドレスを同期する。
- 店舗から人物を外してもグループ内の人物と利用人数算入は維持し、グループからの削除では全所属と未送信通知を失効する。
- 店舗またはグループから人物を削除する場合は、確認画面へ「今日以降のシフトN件からも外れます」とJST基準の件数を表示し、確定時に対象範囲の今日以降の割当を同じtransactionで削除する。
  過去の割当と募集状態は維持する。
- 店舗またはグループから人物を外す場合も、`organizationPeople`と`staffs`の氏名、メールアドレス、正規化メールは過去の業務履歴を識別するため保持する。
- グループ全体のユーザー一覧には、店舗所属がなくても利用人数に含まれる人物を「店舗未所属」として表示し、所属店舗を「店舗所属なし」と表示する。
- 課金通知と招待通知は既存のNotification Outboxへ積み、外部送信前にグループ、所属、課金状態、通知起点の課金versionを再確認する。招待トークンはOutboxへ保存せず、送信直前に導出する。
- Free移行または契約制限開始前の業務操作から遅延して作られた通知も、通知起点のversionで判定して送信しない。
- メール通知は外部送信の直前に現在のグループ内の人物、スタッフ、または利用者のメールアドレスと宛先を照合し、変更前の宛先へ送信しない。
- 閲覧専用へ切り替わった画面は、開いていた書込ダイアログを閉じ、ShiftBoardの未保存編集を永続化済みデータへ戻す。
- グループ削除は、対象グループでほかに有効な管理者がなく、課金状態が未選択Trial、Free、支払い不要Businessのいずれかで、店舗削除job、非終端のStripe Subscription、Trial契約作成処理が進行していない場合だけ許可する。完了済みまたは要対応の作成処理も、対応するローカルSubscriptionが一意に終端化済みであることを確認できなければ拒否する。UIの表示可否だけに依存せず、mutationで所属、対象ID、更新時刻、課金状態、provider処理を再検証する。
- グループ削除受付ではグループを即時に論理削除し、全店舗、人物所属、店舗所属、権限、session、token、招待、未送信通知の終了処理を再開可能な永続jobで行う。
- グループ名、請求先メールアドレス、正規化請求先メール、店舗名、人物とスタッフの氏名、メールアドレス、正規化メールは保持し、LINE IDは削除済みの値へ置き換える。
- グループ削除ではglobal `users`とClerk認証を変更しない。ログインアカウントの削除は、所属なしユーザーがstrict再認証を通る明示的なアカウント削除導線でだけ受け付ける。

## 関連ファイル

### バックエンド

- `convex/schema.ts`：グループ、人物、管理者所属、招待、課金状態、監査、移行衝突のテーブル定義。
- `convex/_lib/functions.ts`：認証、グループ所属、選択店舗、課金状態を検証する管理者API wrapper。
- `convex/setup/mutations.ts`：グループ、最初の管理者、最初の店舗、支払い不要Business課金状態を一つの初期設定処理で作成。
- `convex/organization/`：グループ設定DTO、店舗操作、人物削除、今日以降のシフト割当整理、認可、監査、利用状況集計。
- `convex/organizationBilling/`：Free、Trial、Pro、Businessの上限、runtimeのプラン解決、操作policy、期限処理、Free選択、請求先メール、課金通知。
- `convex/organizationStripe/`：ProとBusinessのPrice解決、即時日割り変更、期間末変更、Secret keyによる接続環境判定、Stripe API操作、Webhook署名検証、イベント重複排除、再試行、provider参照。
- `convex/http.ts`：`POST /stripe/webhook`をStripe Webhook handlerへ接続。
- `convex/organizationInvitation/`：管理者招待の発行、再送、取消、失効、公開プレビュー、アカウント連携、通知。
- `convex/notificationOutbox/`：グループ単位の通知scope、契約制限時の未送信業務通知停止、送信直前の再確認。
- `convex/deletionCleanup/`：店舗とグループ削除の永続job、所属とCapabilityの失効、LINE IDの切断、未送信通知停止、lease回収。
- `convex/migrations/m009_shops_to_organizations.ts`：既存店舗から一店舗一グループを作成。
- `convex/migrations/m010_shop_members_to_organization_members.ts`：既存店舗管理者をグループ内の人物と管理者所属へ移行。
- `convex/migrations/m011_staffs_to_organization_people.ts`：既存スタッフをグループ内の人物へ結び付け、曖昧な一致を衝突として記録。
- `convex/migrations/m012_organizations_add_complimentary_business.ts`：移行元店舗との対応を確認できるグループへ、当時の`complimentary.pro`を付与した履歴migration。
  ファイル名と保存値は履歴として維持する。
- `convex/migrations/m013_former_managers_remove_manager_access.ts`：交代済み旧管理者の由来を確認し、管理者所属だけを`removed`へ移行。
- `convex/migrations/m014_removed_organization_members_delete_legacy_shop_members.ts`：`removed`になった管理者の旧店舗管理権限を削除済みにする。
- `convex/migrations/m015_organization_invitations_link_lifecycle.ts`：旧`pending`を`issued`へ、旧`accepted`を`linked`へ移行し、連携者と招待時氏名を補完する。
- `convex/migrations/m016_deleted_shops_enqueue_cleanup_jobs.ts`：既存の削除済み店舗へ重複しないcleanup jobを作成する。
- `convex/migrations/m017_deleted_organizations_enqueue_cleanup_jobs.ts`：既存の削除済みグループへ重複しないcleanup jobを作成する。
- `convex/migrations/m018_organization_billing_business_to_pro.ts`：Business廃止時に旧Business系の保存状態をProへ正規化し、Freeの5名上限で制限状態を再評価した履歴migration。
  Business再導入後のruntime policyには使わない。
- `convex/migrations/m021_organization_billing_complimentary_pro_to_business.ts`：Stripe証跡のない`complimentary.pro`だけを`complimentary.business`へ移行し、versionと一意な監査を更新する。
- `convex/migrations/index.ts`：固定series、m012/m018/m021の限定dry run、旧管理者権限の衝突解消後にm013、m014だけを再評価する専用runnerを公開。
- `scripts/verifyComplimentaryBusinessM021Export.ts`：m021前後の対象集合、Stripe隔離、監査、conflictをConvex exportからfail-closedに検証する。
- `scripts/setupEnv.ts`：管理者招待、Pro Price、Business Priceを含むStripeのサーバー環境変数をConvex環境へ同期。

### フロントエンド

- `src/routes/_auth/settings.tsx` と `src/pages/settings/`：グループ設定の取得、読み込み状態、画面全体の配置。
- `src/components/features/OrganizationSettings/`：グループ全体のユーザー一覧とユーザー詳細ページへの入口、店舗一覧と店舗詳細ページへの入口、プランと支払い、設定タブのグループ削除UI、および操作ごとの送信、ダイアログ、最新権限を管理するcontroller。
- `src/routes/_auth/shops.$shopId.tsx`、`src/pages/shop-detail/`、`src/components/features/ShopDetail/`：同一グループの店舗詳細ページ、店舗情報の閲覧・一括編集、所属スタッフ数とAccordion一覧、削除確認を管理する。
- `src/components/features/AuthenticatedApp/DeletedAccountState.tsx`：削除済みuserへClerk由来の氏名・メールを表示せず、利用終了状態とサインアウトだけを表示する。
- `src/components/features/ShopSwitcher/`：グループごとにまとめた店舗切り替え。
- `src/components/features/AuthenticatedApp/AuthGuard.tsx`：`?shop=`、前回値、利用可能店舗一覧を解決し、有効なAPI候補だけを店舗コンテキストへ同期する。
- `src/components/features/Dashboard/OperationContext/`：現在のグループと店舗を二枚のカードで表示し、複数候補だけを切り替え可能にする。
- `src/routes/manager-invite.tsx` と `src/components/features/ManagerInvitationAcceptance/`：公開招待プレビュー、認証導線、ログイン後の自動連携結果。
- `src/stores/shop/`：最後に確定した有効なグループと店舗の永続化、旧保存値の正規化、選択可否判定。
- `src/hooks/useShopQuery.ts`、`src/hooks/useShopPaginatedQuery.ts`、`src/hooks/useShopMutation.ts`：選択店舗を管理者APIへ渡すhook。
- `src/components/features/Dashboard/`：アーカイブ、プラン停止、閲覧のみ所属、契約制限、支払い確認中の店舗を閲覧専用で表示する。
- `src/routes/_auth/users.$personId.tsx`、`src/pages/user-detail/`、`src/components/features/UserDetail/`：グループ人物を正本とするユーザー詳細ページ、店舗切り替え、プロフィール、通知、LINE、設定を管理する。
- `src/components/features/Dashboard/StaffManagement/` と `StaffRoster/`：店舗スタッフ一覧からユーザー詳細ページへ遷移する。人物IDが未移行のスタッフに限り、旧スタッフ詳細モーダルへ切り替える。
- `src/components/features/ShiftBoard/`：閲覧専用状態では保存と確定を停止し、状態遷移時に未保存編集を破棄する。

## 画面一覧

| 画面 | 役割 |
| --- | --- |
| `/settings?shop=<shopId>` | 指定店舗からグループを解決し、ユーザー、店舗、プランと支払い、設定の4タブを扱う。設定タブでは削除可否理由を表示し、対象名の再入力後にグループ削除を受け付ける。タブは`tab` queryで保持する |
| `/shops/<targetShopId>?shop=<contextShopId>&returnTo=dashboard` | `shop`で解決したグループ内の対象店舗だけを表示し、店舗情報と削除可否を同じ画面で確認する。Dashboardから開いた場合は同じ店舗のDashboardへ戻る |
| `/users/<personId>?shop=<shopId>&panel=<basic|addShop|shop>` | グループ人物の基本情報と所属店舗を表示し、基本情報、店舗追加、選択店舗の通知・LINE連携・店舗設定をDialogで扱う |
| 認証済みヘッダー | Dashboard、グループ設定、店舗詳細、ユーザー詳細以外で複数店舗がある場合に、現在のグループと店舗を表示して利用可能な店舗へ切り替える |
| `/manager-invite?token=...` | 招待先グループと期限を公開DTOで確認し、ログインまたは登録後に確認済みメールのアカウントを自動連携する |
| `/dashboard?shop=<shopId>` | グループと店舗のコンテキストカードを表示し、候補が複数ある場合だけ切り替える。店舗詳細は`/shops/<shopId>`、グループ設定は`/settings`へ進む |
| 各店舗業務画面 | `shop` queryを引き継ぎ、候補照合済みの選択店舗をAPIへ渡して、グループ所属と店舗境界の再検証後に既存データを扱う |

## Public API一覧

| API | 種別 | 用途 |
| --- | --- | --- |
| `api.setup.mutations.setupShopAndManager` | `authenticatedMutation` | グループ、管理者、最初の店舗、支払い不要Business課金状態を作成する |
| `api.dashboard.queries.getMyShops` | `authenticatedQuery` | 利用者が閲覧できる店舗をグループ情報と所属状態付きで返す |
| `api.dashboard.queries.getDashboardShop` | `managerQuery` | 店舗情報とグループ課金から導出した業務更新可否を返す |
| `api.dashboard.queries.getDashboardStaffs` | `managerQuery` | 店舗スタッフ、対応するグループ人物ID、管理者状態、管理者招待可否をページングして返す |
| `api.organization.queries.getSettings` | `managerQuery` | 選択店舗から所属グループを特定し、所属店舗ID付きユーザー、管理者招待、店舗、課金、グループ削除可否と更新時刻を含む設定DTOを返す |
| `api.organization.userDetailQueries.getUserDetail` | `managerQuery` | URLの人物が選択店舗と同じグループに属することを確認し、共通プロフィール、管理者権限、操作可否、店舗別所属を返す |
| `api.organization.mutations.updateOrganizationName` | `authenticatedMutation` | 選択店舗と有効なグループ所属を確認してグループ名を変更する |
| `api.organization.mutations.addShop` | `authenticatedMutation` | 有料機能と上限を再確認して店舗を追加する |
| `api.organization.mutations.deleteShop` | `authenticatedMutation` | 対象店舗のグループ所属、管理者権限、確認ID、requestIdを再確認し、最後の店舗を除いて削除と後続cleanupを開始する |
| `api.organization.mutations.deleteOrganization` | `authenticatedMutation` | 唯一の有効管理者、課金状態、対象ID、更新時刻、requestIdを再確認し、グループを即時停止して永続cleanupを開始する |
| `api.organization.mutations.archiveShop` | `authenticatedMutation` | グループ所属と復旧権限を確認して店舗をアーカイブする |
| `api.organization.mutations.reactivateShop` | `authenticatedMutation` | グループ所属と店舗上限を確認して店舗を再稼働する |
| `api.organization.mutations.removePersonFromShop` | `authenticatedMutation` | JSTの今日以降のシフト件数と確認snapshotを再検証し、対象店舗の割当、スタッフ所属、アクセスを同じtransactionで終了する |
| `api.organization.mutations.removePersonFromOrganization` | `authenticatedMutation` | 最後の管理者、請求先、今日以降のシフト件数と確認snapshotを再検証し、全店舗の割当と人物のグループ内アクセスを同じtransactionで終了する |
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
| `api.organizationBilling.mutations.setFreeSelection` | `authenticatedMutation` | Freeで残す管理者と店舗を保存し、契約制限中は再評価する。支払い不要Businessでは拒否する |
| `api.organizationBilling.mutations.updateBillingEmail` | `authenticatedMutation` | 有効管理者または復旧担当者が請求先メールアドレスを変更する。正規化値が同じ再実行は副作用なしで収束し、支払い不要Businessでは拒否する |
| `api.organizationStripe.actions.getPlanPrice` | `action` | サーバー側allowlistからProまたはBusinessのPriceを選び、接続環境、active状態、月額周期、通貨を確認して金額を返す |
| `api.organizationStripe.actions.startPaidCheckout` | `action` | 認可、課金状態、request ID、対象プランを確認し、ProまたはBusinessのCheckout Sessionを作成する |
| `api.organizationStripe.actions.previewPaidPlanChange` | `action` | ProからBusinessへの変更について、Stripe Invoice Previewの日割り金額と実更新で使う`prorationDate`を返す |
| `api.organizationStripe.actions.changePaidPlanNow` | `action` | Previewと同じ`prorationDate`とSubscription ItemでProからBusinessへ即時変更し、支払い確認まではPro権限を維持する |
| `api.organizationStripe.actions.schedulePaidPlanChange` | `action` | BusinessからProへのSubscription Schedule、または有料プランからFreeへの期間末変更を予約する |
| `api.organizationStripe.actions.cancelScheduledPlanChange` | `action` | providerで確認できたBusinessからProまたは有料プランからFreeへの変更予約を取り消す |
| `api.organizationStripe.actions.getProPrice` / `startProCheckout` | `action` | Pro専用の旧クライアント向け互換API |
| `api.organizationStripe.actions.openCustomerPortal` | `action` | 有効管理者または復旧担当者を確認し、保存済みCustomerだけに一時的なPortal Sessionを作成する |
| `api.organizationStripe.actions.scheduleFreeAtPeriodEnd` / `cancelScheduledFree` | `action` | Freeへの期間末変更を予約または取り消す旧クライアント向け互換API |
| `api.organizationStripe.actions.cancelTrialContinuation` | `action` | 無料体験後の継続予約を取り消し、初回請求を開始しない状態へ戻す |
| `POST /staff-registration/submit` | Convex HTTP Action | Origin、body、Turnstile、hash budgetを検証し、稼働中店舗の公開登録リンクから申請を受け付ける |
| `internal.staffRegistration.mutations.submitRegistrationRequestFromHttp` | `internalMutation` | HTTP入口の検証後に、最新の店舗・契約状態を再確認してスタッフ登録申請を作成する |
| `api.staffRegistration.mutations.approveRequest` | `managerMutation` | 最新の契約上限を確認し、予約枠を人物へ付け替えて申請を承認する |

すべてのpublic Convex functionは、runtimeの`args`と`returns` validatorを持つ。
クライアントが渡すグループID、店舗ID、人物IDは操作対象の指定であり、認可根拠には使わない。

Stripe Webhookは各Convex deploymentの`https://<deployment>.convex.site/stripe/webhook`へ`POST`し、raw bodyと`Stripe-Signature`の検証に成功したイベントだけを内部処理へ渡す。
Cloudflare PagesのURLはCheckoutとPortalの戻り先であり、Webhook送信先には使わない。
既知のSubscription、Invoice、Checkout Sessionは`livemode`とprovider object IDの複合indexから最大2件だけ読み、重複時はグループを推測しない。

Webhook destinationには次の13イベントだけを登録する。

- `checkout.session.completed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.pending_update_applied`
- `customer.subscription.pending_update_expired`
- `subscription_schedule.updated`
- `subscription_schedule.released`
- `subscription_schedule.canceled`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`

Checkout SessionはTrialのSetupと、Freeまたは契約制限中から開始するProまたはBusinessの即時契約で`card`だけを許可し、成功・取消URLをサーバー設定の`APP_URL`配下へ固定する。
PAN、CVC、有効期限はアプリの引数、DB、ログへ渡さない。

TrialのCheckout完了は、SetupIntentの`succeeded`、`off_session`、対象Customerと、PaymentMethodの`card`、対象Customerを再照合してからSubscriptionを作成する。

即時契約の`invoice.payment_action_required`は追加認証が終わるまで`pendingActivation`を維持し、対象の有料権限へ進めない。
後続の最新`invoice.paid`と対象Priceを再照合できた場合だけ`active.pro`または`active.business`へ収束する。

ProからBusinessへのPending Updateが失効または支払い未確定になった場合はProを維持し、検証済みの`pending_update_applied`と`invoice.paid`を確認した場合だけBusinessへ進める。

Stripe APIの拒否詳細、decline code、provider payloadは公開Action、console、Stripe operationへ保存せず、固定した安全なerror codeだけを保持する。

## Internal API一覧

| API | 種別 | 用途 |
| --- | --- | --- |
| `internal.organizationBilling.mutations.processDeadline` | `internalMutation` | versionと期限を再確認し、Trial終了、猶予終了、期間末変更を適用する |
| `internal.organizationBilling.mutations.selectTrialPro` | `internalMutation` | Checkout作成後にTrialのProまたはBusiness継続予約をprovider参照付きで保存する。API名は既存互換のため維持する |
| `internal.organizationBilling.mutations.setStateFromVerifiedBilling` | `internalMutation` | 検証済みの外部課金結果だけをグループ課金状態へ反映する接続点 |
| `internal.organizationBilling.mutations.applyUnexpectedCancellation` | `internalMutation` | Stripe側の想定外終了をFreeまたは契約制限中へ安全側に反映する |
| `internal.organizationStripe.actions.processWebhookEvent` | `internalAction` | 重複排除済みWebhookをlease付きで処理し、必要なStripe再照合と課金状態遷移を行う |
| `internal.organizationStripe.actions.reconcileInvalidTrialSubscriptionCancellation` | `internalAction` | Trial契約作成後の検証失敗または公開停止で残ったSubscriptionを、作成処理との対応を再検証して取消完了まで回収する |
| `internal.organizationStripe.actions.reconcileScheduledPaidPlanDeadline` | `internalAction` | BusinessからProへの期間末変更についてSubscription Schedule、Price、Invoiceを再取得し、変更成功、猶予、Pro上限超過による制限を確定する |
| `internal.organizationStripe.maintenance.recoverWebhookEvents` | `internalMutation` | 予約漏れ、期限切れlease、再試行期限を迎えたWebhookをbounded batchで再予約する |
| `internal.organizationStripe.maintenance.recoverSafeOperations` | `internalMutation` | 安定したidempotency keyを持つ再照合、取消、請求停止だけをbounded batchで再予約する |
| `internal.organizationStripe.maintenance.getProbe` | `internalQuery` | Webhook、operation、ローカルCustomer/Subscription対応、支払い不要プランのStripe隔離、m021待ちを汎用field名のbounded観測値で返す |
| `internal.organizationStripe.maintenance.verifyLegacyBusinessStates` | `internalQuery` | Business廃止時のm018について、旧Businessが0件か全page走査した履歴用cursor付き結果を返す。Business再導入後の日常probeには使わない |
| `internal.organizationStripe.maintenance.pruneExpiredTerminalRecords` | `internalMutation` | 保持期限を過ぎたterminal Webhook/operationをstatus別indexからbounded削除する。最新terminal世代の取消・請求停止成功証拠は次世代作成まで、不正Trial契約の作成元と取消証拠はprovider終端snapshotを一意に確認できるまで保持する |
| `internal.organizationBilling.queries.getNotificationData` | `internalQuery` | 現在の課金状態と所属から課金メールの宛先を再解決する |
| `internal.organizationBilling.actions.enqueueBillingNotification` | `internalAction` | 課金メールを既存Notification Outboxへ重複排除付きで予約する |
| `internal.organizationInvitation.mutations.expire` | `internalMutation` | versionと期限が一致する`issued`招待だけを失効させる |
| `internal.organizationInvitation.queries.getEnqueueData` | `internalQuery` | 送信直前に招待、発行者、グループ、課金状態を再確認する |
| `internal.organizationInvitation.queries.getAcceptanceNotificationData` | `internalQuery` | アカウント連携完了通知のグループ、有効管理者、代表店舗を再解決する |
| `internal.organizationInvitation.actions.enqueueManagerInvitation` | `internalAction` | 管理者招待メールをNotification Outboxへ重複排除付きで予約する |
| `internal.organizationInvitation.actions.enqueueAcceptanceNotifications` | `internalAction` | 連携者を含む全有効管理者へ連携完了メールを予約する |
| `internal.notificationOutbox.mutations.prepareForDelivery` | `internalMutation` | 外部送信直前にグループ、店舗、所属、課金状態を再確認する |
| `internal.notificationOutbox.mutations.prepareOrganizationManagerInvitationEmail` | `internalMutation` | 招待送信直前に有効性を確認し、生トークンを含まない表示情報を返す |
| `internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications` | `internalMutation` | Free移行または契約制限開始後に未送信の業務通知を停止する |
| `internal.deletionCleanup.mutations.kick` / `process` | `internalMutation` | 永続jobをlease付きで取得し、店舗またはグループのcleanupをbounded batchで進める |
| `internal.deletionCleanup.mutations.recover` | `internalMutation` | retry待ちまたは期限切れleaseのjobを再開するcron入口 |
| `internal.migrations.index.run` | `internalMutation` | 登録済みmigrationを順番に実行する |
| `internal.migrations.index.runM012` | `internalMutation` | m012だけをdry runまたは衝突修復後に限定再実行する |
| `internal.migrations.index.runM018` | `internalMutation` | m018だけをdevelopで限定dry runする。固定seriesの本実行とは分ける |
| `internal.migrations.index.runM021` | `internalMutation` | m021だけをdry runする。developmentでconflictを裁定した場合の限定再評価にも使い、productionではresetしない |
| `internal.migrations.index.runFormerManagerAccessCleanup` | `internalMutation` | m013とm014だけを順番に実行し、衝突裁定後も限定再評価する |
| `internal.organization.migrations.resolveFormerManagerAccessConflict` | `internalMutation` | 曖昧な旧管理者を固定理由で裁定し、権限失効または認可済み`readOnly`維持を監査する |

`m009`から`m021`は`@convex-dev/migrations`の固定seriesから順番に実行する。

`runM012`は通常の固定seriesとは別に、m012のdry run確認または衝突修復後の限定再実行にだけ使う。

以下のm018手順と`verifyLegacyBusinessStates`は、Business廃止時に旧BusinessをProへ正規化した履歴である。
Business再導入後の通常課金または支払い不要Businessをlegacyとして判定する手順ではない。

`m018`はdevelopへmergeする前に、development deploymentだけへローカルコードをpushして一batchのrollbackを確認する。

```bash
npx convex run migrations/index:runM018 '{"dryRun":true}' --push --deployment dev
```

dry runは意図的に`DryRun: No changes were committed.`で終了し、全件完走や0件を証明しない。
developへmergeすると`deploy.yml`が`migrations/index:run`の固定seriesを自動実行するため、手動の本実行を重ねない。
当時は、developでm018のstatusがsuccess、未解消migration conflictが0件、全page検証で旧Businessが0件になった後だけ、本番向け`release:*`を進めた。
本番releaseでも`release.yml`が固定seriesを自動実行する。
このm018履歴は、現在のBusiness状態へ再実行しない。

### m021 支払い不要Business移行

m021は`complimentary.pro`だけを対象とし、同じグループの課金状態が一件であること、グループが存在すること、Stripe Customer、Subscription、statusを問わないoperation、課金通知、先行監査がないことを確認してから実行する。
pre export verifierは、migration内の検査に加えてStripe Webhook証跡がないことも確認する。

実行直前のsnapshot Bではpre verifierを通し、対象件数と`organizationId|organizationBillingStateId`をsortした`targetSetSha256`をアクセス制御された証跡へ保存する。

```bash
pnpm convex:verify-complimentary-m021-export -- \
  --mode pre \
  --path <snapshot-b.zip>
```

m021完了後は別のsnapshot Cへpost verifierを実行し、preの対象件数とhashを必ず指定する。

```bash
pnpm convex:verify-complimentary-m021-export -- \
  --mode post \
  --path <snapshot-c.zip> \
  --expected-target-count <pre-target-count> \
  --expected-target-set-sha256 <pre-target-set-sha256>
```

export verifierの`migrationStatus: "not_verified_by_export"`は意図した結果である。
snapshotだけではmigration workerの完走を証明できないため、Dashboardで確認した完全修飾deployment名を指定し、`isDone: true`、`state: "success"`、`error`なしを別途確認する。

```bash
pnpm exec convex run --deployment <production-deployment-name> \
  --component migrations lib:getStatus \
  '{"names":["migrations/m021_organization_billing_complimentary_pro_to_business:migration"]}' \
  --watch
```

snapshot A、B、Cは別々の制限付きパスへ保存し、deployment名、Git SHA、取得時刻、ZIP SHA-256、対象件数、対象set hash、verifier結果を記録する。
production snapshotには`pnpm convex:save`を使わず、Dashboard backupまたは完全修飾deployment名を指定した`convex export`を使う。
m021後はpre-Widen版へ戻さず、問題の修復はm022以降のforward migrationで行う。
productionでm021をresetしたり、課金証跡、監査、conflictを手動削除したりしない。

## 環境変数

### 管理者招待

- `ORGANIZATION_INVITATION_SIGNING_SECRET`：管理者招待トークンをHMAC-SHA-256で導出する32文字以上のサーバー側秘密値。

この秘密値を変更すると`issued`招待のトークンを検証できなくなるため、変更時は未連携招待を再発行する。

### Stripe

- `STRIPE_SECRET_KEY`：Stripeのサーバー側秘密鍵。`sk_test_`または`sk_live_`の接頭辞から接続環境を自動判定する。
- `STRIPE_WEBHOOK_SECRET`：`POST /stripe/webhook`の署名検証に使うWebhook署名シークレット。
- `STRIPE_PRO_PRICE_ID`：Proに対応するStripe Price ID。
- `STRIPE_BUSINESS_PRICE_ID`：Businessに対応するStripe Price ID。
  未設定またはProと同一の場合は、Pro課金とPortalを止めずにBusinessの価格表示と契約変更だけを停止する。
- `STRIPE_PORTAL_CONFIGURATION_ID`：支払い方法更新と請求履歴だけを許可するCustomer Portal Configuration ID。
- `APP_URL`：CheckoutとCustomer Portalの戻り先に使うアプリケーションURL。

Stripe.jsをブラウザで直接使わないため、`VITE_STRIPE_PUBLISHABLE_KEY`は使わない。

Stripeの値はブラウザへ公開せず、`.env`から`pnpm convex:env:setup`でConvex環境へ同期する。
`STRIPE_SECRET_KEY`が`sk_test_`または`sk_live_`で始まらない場合は設定不備として課金操作を開始しない。
Price、Customer、Subscription、Invoiceなどの`livemode`が接続環境と一致しない場合も課金操作を拒否する。

Localと開発用Convex deploymentは、それぞれ専用のStripe Sandboxへ`sk_test_`で始まるSecret keyを使って接続する。
本番deploymentは本番Stripeアカウントへ`sk_live_`で始まるSecret keyを使って接続し、Sandboxの実値を流用しない。

新規販売を停止するときは、Stripe上の対象プランのPriceをアーカイブする。
アーカイブ前に発行したopen状態のCheckout Sessionは自動失効しないため、別途失効させる。
アーカイブ前に作成されローカル同期済みのSubscriptionは既存契約として収束を継続する。作成結果が未同期の場合はmetadataで一意な既存objectだけを回収して取り消し、Subscription作成は再送しない。
既存契約の状態を失わないように、Secret keyとWebhook署名シークレットは単純に削除せず、Webhook受信、再照合、取消、Invoice回収停止を継続する。

## プラン上限

| プラン | 利用人数上限 | 稼働店舗上限 | 有効管理者上限 |
| --- | ---: | ---: | ---: |
| Trial | 20 | 5 | 5 |
| Free | 5 | 1 | 1 |
| Pro | 20 | 5 | 5 |
| Business | 40 | 5 | 5 |
| 支払い不要Business | 40 | 5 | 5 |

Trialの利用権限と上限はPro相当とする。

支払い不要BusinessはBusinessと同じ上限と有料機能を持つが、Stripe課金ライフサイクルへ入らない。

利用人数は、グループ内の有効なスタッフまたは有効管理者を人物単位で一度だけ数える。
`issued`招待は利用人数に含めず、新しい人物への招待が予約した枠を上限判定へ加える。

管理者上限は、activeな管理者と期限内の`issued`追加招待を合計して判定する。

Freeの管理者交代招待は管理者を入れ替えるため、追加枠を予約しない。

グレードダウン時に変更先の上限を超える人物、店舗、管理者を自動削除しない。
画面は変更先まで「あとN名削除してください」と不足数を表示し、上限内になってから変更を確定または制限状態を解除する。
BusinessからProでは利用人数を20名まで、ProまたはBusinessからFreeでは利用人数を5名、稼働店舗を1店舗、有効管理者を1名まで整理する。

## 課金状態と操作可否

| 保存状態 | 利用権限 |
| --- | --- |
| `trial` | Pro相当の20名、5店舗、管理者5名で業務更新と有料機能を許可し、JST基準の終了期限を持つ |
| `initialPaymentPending` | ProまたはBusinessを変更先として保持するが、初回支払いを確認するまではTrial由来のPro権限を維持する |
| `pendingActivation` | 支払い成功を確認するまで保存済みのFree、Pro、契約制限中の権限を継続し、変更先の有料権限は開放しない |
| `active.free` | Free上限で業務更新を許可し、複数店舗と複数管理者などの有料機能を拒否する |
| `active.pro` | Pro上限で業務更新と有料機能を許可する |
| `active.business` | Business上限で業務更新と有料機能を許可する |
| `complimentary.business` | Business上限で業務更新と有料機能を許可し、期限、Stripeオブジェクト、支払い操作、課金通知を持たない |
| `complimentary.pro` | m021まで受け入れるWiden互換状態。表示、告知対象、上限は支払い不要Businessとして解決する |
| `scheduledChange` | 期限までは現在の有料プランを維持し、ProまたはBusinessからFree、BusinessからProへの変更をversion付き期限処理で適用する |
| `grace` | 猶予期限までは元の有料プランを維持し、期限超過時に再確認して制限へ移す |
| `restricted` | 既存データの閲覧と、指定された復旧担当者による支払い、人物削除、店舗削除だけを許可し、FreeまたはProの変更先上限を明示する |

店舗状態は`active`、`archived`、`planSuspended`を区別する。
管理者所属は`active`、`readOnly`、`removed`を区別し、閲覧専用または削除済み所属から通常mutationを実行させない。

再契約、新規契約、ProからBusinessへの即時変更の支払い確認中を表す`pendingActivation`では、Free、Pro、または直前の`restricted`状態をversion付きsnapshotとして保持する。
FreeまたはProを保持している間はそのプランの業務を継続でき、`restricted`を保持している間は閲覧と許可済みの復旧操作だけを継続できる。
支払い失敗時は保存済みsnapshotへ戻し、支払い成功が検証されるまで有料権限を開放しない。
期間末変更の取消は検証済みのprovider結果だけを受け付け、現在の有料プランを継続する。

## 移行状態

- schemaはWiden状態であり、既存行を受け入れるため一部のグループ参照と店舗状態をoptionalにしている。
- `m009`は店舗名やメールアドレスだけで別店舗を同じグループへ統合せず、一店舗一グループとして移行する。
- `m010`と`m011`は利用者ID、正規化済みメールアドレス、氏名を一意に確認できる場合だけ人物を再利用する。
- 同じ移行元店舗を示すグループ、同じグループと利用者の管理者所属、同じメールアドレスの人物が重複する場合は任意の一件を採用しない。
- `userId`付きの旧行は参照先ユーザーと人物の恒久IDを優先し、別ユーザーの同一メールや存在しないユーザーを自動統合しない。
- 推測で統合できない行は`organizationMigrationConflicts`へ識別可能な衝突として残す。
- 移行期間は`shopMembers`、`shopBillingStates`、旧スタッフ参照への最小限のfallbackと互換書き込みを残す。
- `m012`はBusiness廃止前の履歴として、`migrationSourceShopId`と店舗の相互リンクを確認でき、課金状態が未設定のグループだけに`complimentary.pro`を作成した。
- `m012`は既存課金状態、重複課金状態、移行元markerの重複、リンク不整合を上書きせず、migration conflictとして記録した。
  現在の新規グループ作成には使わない。
- `m013`はFree選択と交代監査から旧管理者だと一意に確認できる`readOnly`だけを`removed`へ変更し、スタッフ所属とスタッフ向け通知を維持する。
- `m014`はcanonicalな管理者所属が`removed`であることを一意に確認できる旧`shopMembers`だけを削除済みにする。
- `m018`はBusiness廃止時の履歴として、当時の`active.business`、`complimentary.business`と、内部にBusinessを含む遷移状態をProへ正規化した。
- Business再導入後の通常runtimeはProとBusinessを別プランとして解決する。
  m018専用のBusinessからProへの正規化helperは、履歴migrationの再現性を保つためだけに残す。
- `m021`は課金状態が一意で、グループが存在し、Stripe Customer、Subscription、すべてのstatusのoperation、課金通知、先行監査がない`complimentary.pro`だけを`complimentary.business`へ変更する。
- m021対象外の不整合は推測で変更せず、理由別のmigration conflictへ記録する。
- 既存Migrationのファイル名、runner名、conflict code、監査値は履歴として維持する。
- `businessWrite`と`cancelOrganizationBusinessNotifications`の`Business`は有料プランではなく業務処理を表すため、名称を維持する。
- `m016`と`m017`は既存の削除済み店舗・グループへ決定的なrequest IDでcleanup jobを作る。削除済みグループ配下の店舗は`m016`でskipし、親グループjobだけで処理する。
- 業務識別情報の保持は既存fieldを上書きしない変更であり、新しいschema migrationは追加しない。`m016`と`m017`が作るjobも、展開後のworkerでは業務識別情報を保持してアクセスを失効する。
- すでに削除済みの値へマスキングされたグループ名、請求先メールアドレス、店舗名、氏名、メールアドレスは、この変更で推測またはバックアップから自動復元しない。
- m013とm014で由来や対応が曖昧な行は自動変更せず、migration conflictとして手動裁定へ回す。
- `pnpm convex:verify-complimentary-export`とm012の`lib:getStatus`確認は、m012 rollout時の履歴手順として残す。
  現在のm021には`pnpm convex:verify-complimentary-m021-export`とm021のcomponent status確認を使う。
- production snapshotには既存ファイルを掃除・上書きする`pnpm convex:save`を使わず、Dashboard backupまたは保存先を明示した`convex export`を使う。

## 外部ゲートと対象外

| 項目 | 状態 |
| --- | --- |
| ProとBusinessの価格、税、請求周期、日割り、返金、クレジット、未払い請求書の最終処理 | 金額はコードへ固定せず、Stripe Priceから取得する。ProのSandbox Priceは登録済みであり、Businessの実価格と各環境の`STRIPE_BUSINESS_PRICE_ID`同期、本番公開前の会計方針は外部ゲートとして残る |
| 既存本番利用者へ割り当てる初期課金状態 | 課金証跡のない`complimentary.pro`をm021で`complimentary.business`へ移行する。新規グループは初めから`complimentary.business`を作成する |
| Stripe接続環境 | Localと開発用Convex deploymentは別々のSandboxへ接続し、本番deploymentは本番Stripeアカウントへ接続する。`STRIPE_SECRET_KEY`の接頭辞から自動判定する |
| Stripe Product、Price、Webhook endpoint、Customer Portal | アプリ側はProとBusinessを別のPrice IDで扱う。本番では各プランの実値と外部設定を登録し、Business Priceだけが未設定ならBusiness操作だけを停止する |
| Stripeの新規販売停止 | 対象プランのPriceをアーカイブし、発行済みのopen Checkout Sessionを別途失効させる |
| Stripe Webhookと既存契約の安全処理 | 新規販売の停止中も署名検証、重複排除、再試行、状態照合、契約終了の反映に必要な処理を停止しない |
| 本番migration | migrationコードだけを実装し、本番データへは実行していない |
| 本番デプロイ | この実装では実行していない |
| Narrow | 本番相当環境で新モデルの安定を観測するまで実行しない |
| 旧課金データと履歴の物理削除 | 保持期間、対象件数、復旧手段が決まるまで実行しない |
| 削除後の業務識別情報の保持目的と保持期間 | プロダクト責任者の判断後にプライバシーポリシーへ反映する。未確定のまま曖昧な法的根拠を追記しない |

`setStateFromVerifiedBilling`は、署名済みWebhookまたはStripe APIから再照合した検証済み結果だけを課金状態へ反映する内部接続点である。

支払い不要Businessはprovider処理の対象外であり、Stripe関連テーブルにも行を作成しない。

## Stripe運用probeと障害対応

### 日常確認

次のinternal probeは全件集計ではなく、各項目を`observedCount`と`hasMore`で返す。
`hasMore: true`は正常を意味せず、その項目をbounded sampleだけでは判定できないことを意味する。

```bash
npx convex run organizationStripe/maintenance:getProbe '{}'
```

主に次を確認する。

- Webhook status、最古の未処理受信時刻、status sampleに依存しない真の最終`processedAt`。
- `safetyOperations`の未完了`cancelSubscription`、`stopInvoiceCollection`と、`reconcileSubscriptionActionRequired`。
- `safetyOperations.priceRotationBlocking`の`trialSetupCheckout`、`createTrialSubscription`、`immediatePaidCheckout`と、不正Trial Subscriptionの取消待ち。
- `anomalies`の一グループにある複数Customer、複数の非terminal Subscription、SubscriptionとCustomerの対応不一致、Customerに対応する課金状態の欠落。
- `anomalies.activePaidWithoutCurrentSubscription`、`activeFreeWithCurrentSubscription`、`complimentaryStripeMappingP0`、`complimentaryProAwaitingM021`、`unresolvedM018MigrationConflicts`。

ローカルprobeだけでは、Stripe上のPriceがactiveか、Subscription Itemが期待Priceを参照しているか、最新Invoiceがpaid/open/draftのどれか、Invoiceの`auto_advance`が停止したかを証明できない。
これらはStripe APIを再取得する`reconcileSubscription`、取消・請求停止actionで確認し、照合不能または上限超過を`actionRequired`として運用対応へ残す。

`verifyLegacyBusinessStates`はBusiness廃止時のm018 rolloutで、当時の旧Businessが0件になったことを全page確認する履歴用queryである。
Business再導入後の現行データには正規のBusinessが存在するため、日常確認やm021の完了判定には使わない。
当時は次を`isDone: true`まで`continueCursor`で繰り返し、全pageの`legacyBusinessCount`合計が0であることを確認した。

```bash
npx convex run organizationStripe/maintenance:verifyLegacyBusinessStates '{"paginationOpts":{"numItems":100,"cursor":null}}'
```

### 支払い不要プランのP0停止手順

組織ごとの公開ActionとWebhookは支払い不要BusinessをStripe API呼出し前に拒否する。
一方、全組織を毎回走査するグローバルゲートは設けないため、`anomalies.complimentaryStripeMappingP0.observedCount`が1件以上なら次をP0手順とする。

1. Stripe Dashboardで対象deploymentが参照するPro PriceとBusiness Priceをアーカイブし、新しい有料販売を止める。
2. アーカイブ前に発行したopen状態のCheckout Sessionを列挙し、すべて失効させる。
3. 署名済みWebhookと既存契約の取消・請求停止は継続し、Stripe対応を推測削除しない。
4. 対象グループ、Customer、全Subscription世代、Invoiceを照合し、誤請求の有無と返金・credit要否を人が判断する。
5. `observedCount: 0`でも`hasMore: true`なら未確認として扱い、全件reconciliationとcanaryが終わるまで有効なPro PriceまたはBusiness Priceへ切り替えない。

### Priceローテーション

1. 変更対象のPro PriceまたはBusiness Priceをアーカイブし、発行済みのopen Checkout Sessionをすべて失効させて対象プランの新規販売を止める。
2. probeの`safetyOperations.priceRotationBlocking`、取消、請求停止、reconciliationの`actionRequired`を確認する。
3. Stripeで新しいPriceを作成する。
   既存Subscriptionはアーカイブ済みの旧Priceで継続する。
4. 対象に応じて`STRIPE_PRO_PRICE_ID`または`STRIPE_BUSINESS_PRICE_ID`だけを新Priceへ変更して同期する。
   Business PriceはPro Priceと同じ通貨にする。
   新規operationは開始時のPrice snapshotを保持し、既存Subscriptionは保存済みPrice IDで照合する。
5. 接続環境に対応するcanaryを実行し、新Priceを使うCheckoutとSubscriptionを確認する。
6. 旧Priceを使う進行中Trial作成operationが0件までdrainし、既存Subscriptionの継続請求をStripe上で確認する。
   ローカルSubscriptionのPrice IDは一括書換えしない。

rollbackでは新Priceをアーカイブし、発行済みのopen Checkout Sessionをすべて失効させる。
旧Priceを再有効化できる場合は対象のPrice ID環境変数を旧値へ戻して同期し、canary後に販売を再開する。
旧Priceを再有効化できない場合は新Priceのまま原因を解消し、安全を確認してから再有効化する。

## テスト配置

- `convex/organization/*.test.ts`と`convex/organization/personRemoval.test.ts`：グループ境界、店舗操作、人物削除、JSTの今日以降のシフト件数、確認snapshot、最後の管理者、冪等性。
- `convex/organization/deletion.test.ts`：グループ削除の認可、課金条件、即時停止、業務識別情報の保持、アクセス失効、共有user維持、冪等性。
- `convex/deletionCleanup/migrations.test.ts`：m016/m017の対象限定、決定的request ID、親子job重複防止、再実行の冪等性。
- `convex/_scenario/organizationDeletion.test.ts`：複数店舗と100件超の人物を持つグループ削除、中断回収、業務識別情報の保持、アクセス失効、共有userと別グループの維持。
- 店舗またはグループ削除のDB契約はConvex Function TestとScenario Testを主担当とし、削除用アカウントを破壊する新しいE2Eは追加しない。
- `convex/organizationBilling/*.test.ts`：Free、Trial、Pro、Businessの上限、利用人数、JST境界、状態遷移、期限処理、通知。
- `convex/organizationBilling/m021Migration.test.ts`と`scripts/verifyComplimentaryBusinessM021Export.test.ts`：m021の対象限定、課金証跡のfail-closed判定、対象集合hash、監査、conflict、再実行の冪等性。
- `convex/organizationStripe/actions.test.ts`、`queries.test.ts`、`processor.test.ts`：Business Price、即時日割り変更、期間末Schedule、provider再照合、既知Webhook objectの重複時隔離、支払い不要Businessに対するprovider通信前の遮断。
- `convex/organizationStripe/maintenance.test.ts`：Webhook、安全operation、保持期限、汎用field名のbounded probe、支払い不要プランのStripe隔離とm021待ちの観測。
- `convex/organizationInvitation/mutations.test.ts`と`token.test.ts`：発行時の人物未作成、トークン、期限、メール一致、再送ローテーション、アカウント連携、上限、競合、通知。
- `convex/organizationInvitation/lifecycleMigration.test.ts`：旧`pending/accepted`から`issued/linked`への移行と再実行時の冪等性。
- `convex/organization/freeFormerManagerAccessMigration.test.ts`：旧管理者権限移行、衝突、裁定、再実行、スタッフ所属の不変性。
- `convex/_scenario/staffManagerInvitation.test.ts`：既存スタッフの招待、管理者化、4種の管理者digest、権限解除後のスタッフ通知維持までの状態遷移。
- `convex/_scenario/organizationManagerExchange.test.ts`：Free管理者交代後の権限失効、スタッフ継続、通知対象の不変性。
- `convex/_scenario/organizationBillingLifecycle.test.ts`：複数APIと時間経過をまたぐ課金ライフサイクル。
- `convex/_scenario/organizationPaidPlanChanges.test.ts`：TrialからBusiness、ProからBusiness、BusinessからProについて、支払い成功、失敗、上限超過、取消をまたぐ課金状態遷移。
- `convex/_scenario/organizationPersonRemoval.test.ts`：今日以降のシフトがある人物の削除、過去割当と募集状態の維持、制限状態の再評価。
- `convex/organization/migrations.test.ts`：m012の対象限定、衝突記録、監査、再実行の冪等性。
- `convex/dashboard/queries.test.ts`：一人の利用者が複数グループへ所属する場合の店舗候補DTO。
- `src/components/features/AuthenticatedApp/shopContextResolver.test.ts` と `AuthGuard.test.tsx`：URL、前回値、自動fallback、明示URL不正時の解決境界。
- `src/components/features/Dashboard/OperationContext/` のLogic UTとStory：候補数による静的表示・切り替え、設定導線、PC/SPの代表状態。
- `src/components/features/OrganizationSettings/index.stories.tsx`：グループ設定の代表状態と操作後の状態。
- `src/components/features/OrganizationSettings/PlanAndPaymentSection.stories.tsx`と`BillingSettings/BillingActionDialog.stories.tsx`：Business価格、日割り確認、期間末変更、削除不足数、支払い不要Businessを含むプラン変更UI。
- `src/components/features/ShopDetail/index.stories.tsx`：店舗詳細ページの基本情報、一括編集Dialog、スタッフ数とAccordion一覧、閲覧専用、削除確認とPC/SPの代表状態。
- `src/components/features/ManagerInvitationAcceptance/index.stories.tsx`：招待プレビューとアカウント連携結果。
- `src/components/features/ShopSwitcher/index.stories.tsx`：Dashboard以外でのグループと店舗の切り替え。
- `e2e/scenarios/organization-billing-plan-change.test.ts`：Free、Pro、Businessの主要変更導線と、変更先上限を超えた場合の削除案内を検証する。
