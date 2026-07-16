# 事業者課金、複数店舗、複数管理者

## 機能説明

事業者を契約と管理の境界とし、店舗を日常業務の選択単位として扱う。
同じ事業者の有効管理者は全店舗と契約操作を管理でき、人物と利用人数は事業者内で重複なく扱う。

## 仕様の正本

- 業務要件と受入条件は `doc/specs/organization-billing-business-flow.md` を正本とする。
- 実装順序、移行境界、外部ゲートは `doc/plans/2026-07-14_事業者課金_複数店舗_複数管理者_実装計画.md` を参照する。
- この文書は現行コードの機能配置とAPI一覧を示し、料金や会計判断は定義しない。

## 主要な契約

- `organizations` が契約と管理の境界であり、`shops` は事業者に属する操作対象である。
- `organizationPeople` が事業者内の人物を表し、スタッフ兼管理者でも利用人数を重複計上しない。
- `organizationMembers` が管理者所属を表し、`active`、`readOnly`、`removed` の状態を持つ。
- 管理者APIは認証済み利用者から事業者所属を解決し、選択された店舗が同じ事業者に属することをサーバー側で再確認する。
- `organizationBillingStates` が事業者単位の課金状態を保持し、画面とmutationは共通policyから操作可否を導出する。
- 管理者招待はメールで送り、トークンのdigest、有効期限、単回利用、再送時の旧招待失効、回数制限を一つのライフサイクルで扱う。
- 店舗スタッフの編集は`organizationPeople`を正本とし、同じ人物の有効な全店舗スタッフ行へ氏名とメールアドレスを同期する。
- 店舗から人物を外しても事業者内の人物と利用人数算入は維持し、事業者からの削除では全所属と未送信通知を失効する。
- 課金通知と招待通知は既存のNotification Outboxへメールとして積み、外部送信前に事業者、所属、課金状態、通知起点の課金versionを再確認する。
- Free移行または契約制限開始前の業務操作から遅延して作られた通知も、通知起点のversionで判定して送信しない。
- メール通知は外部送信の直前に現在の事業者人物、スタッフ、または利用者のメールアドレスと宛先を照合し、変更前の宛先へ送信しない。
- 閲覧専用へ切り替わった画面は、開いていた書込ダイアログを閉じ、ShiftBoardの未保存編集を永続化済みデータへ戻す。

## 関連ファイル

### バックエンド

- `convex/schema.ts`：事業者、人物、管理者所属、招待、課金状態、監査、移行衝突のテーブル定義。
- `convex/_lib/functions.ts`：認証、事業者所属、選択店舗、課金状態を検証する管理者API wrapper。
- `convex/setup/mutations.ts`：事業者、最初の管理者、最初の店舗、Trial課金状態を一つの初期設定処理で作成。
- `convex/organization/`：事業者設定DTO、店舗操作、人物削除、認可、監査、利用状況集計。
- `convex/organizationBilling/`：プラン上限、操作policy、期限処理、Free選択、請求先メール、課金通知。
- `convex/organizationInvitation/`：管理者招待の作成、再送、取消、失効、公開プレビュー、承認、通知。
- `convex/notificationOutbox/`：事業者単位の通知scope、契約制限時の未送信業務通知停止、送信直前の再確認。
- `convex/migrations/m009_shops_to_organizations.ts`：既存店舗から一店舗一事業者を作成。
- `convex/migrations/m010_shop_members_to_organization_members.ts`：既存店舗管理者を事業者人物と管理者所属へ移行。
- `convex/migrations/m011_staffs_to_organization_people.ts`：既存スタッフを事業者人物へ結び付け、曖昧な一致を衝突として記録。
- `convex/migrations/index.ts`：`m009`から`m011`を既存migration runnerへ登録。
- `scripts/setupEnv.ts`：管理者招待の署名秘密値を含むサーバー環境変数をConvex環境へ同期。

### フロントエンド

- `src/routes/_auth/settings.tsx` と `src/pages/settings/`：事業者設定の取得、読み込み状態、画面全体の配置。
- `src/components/features/OrganizationSettings/`：利用者、招待、店舗、プランと支払いの表示UIと、操作ごとに送信、ダイアログ、最新権限を管理するcontroller。
- `src/components/features/ShopSwitcher/`：事業者ごとにまとめた店舗切り替え。
- `src/routes/_auth/shop-select.tsx` と `src/components/features/ShopSelection/`：複数候補がある場合の店舗選択画面。
- `src/routes/manager-invite.tsx` と `src/components/features/ManagerInvitationAcceptance/`：公開招待プレビュー、認証導線、承認結果。
- `src/stores/shop/`：選択中の事業者と店舗の永続化、旧保存値の正規化、選択可否判定。
- `src/hooks/useShopQuery.ts`、`src/hooks/useShopPaginatedQuery.ts`、`src/hooks/useShopMutation.ts`：選択店舗を管理者APIへ渡すhook。
- `src/components/features/Dashboard/`：アーカイブ、プラン停止、閲覧のみ所属、契約制限、支払い確認中の店舗を閲覧専用で表示する。
- `src/components/features/ShiftBoard/`：閲覧専用状態では保存と確定を停止し、状態遷移時に未保存編集を破棄する。

## 画面一覧

| 画面 | 役割 |
| --- | --- |
| `/settings` | 事業者全体の利用者、管理者招待、店舗、プラン、利用上限、Freeで残す構成を表示する |
| 認証済みヘッダー | 現在の事業者と店舗を表示し、利用可能な店舗へ切り替える |
| `/shop-select` | 複数の候補を事業者ごとにまとめ、操作対象の店舗を選択する |
| `/manager-invite?token=...` | 招待先事業者と期限を公開DTOで確認し、ログインまたは登録後に管理者招待を承認する |
| `/dashboard` と各店舗業務画面 | 選択店舗をAPIへ渡し、事業者所属と店舗境界の再検証後に既存データを扱う |

## Public API一覧

| API | 種別 | 用途 |
| --- | --- | --- |
| `api.setup.mutations.setupShopAndManager` | `authenticatedMutation` | 事業者、管理者、最初の店舗、Trial課金状態を作成する |
| `api.dashboard.queries.getMyShops` | `authenticatedQuery` | 利用者が閲覧できる店舗を事業者情報と所属状態付きで返す |
| `api.dashboard.queries.getDashboardShop` | `managerQuery` | 店舗情報と事業者課金から導出した業務更新可否を返す |
| `api.dashboard.queries.getDashboardStaffs` | `managerQuery` | 店舗スタッフと事業者人物への接続状態をページングして返す |
| `api.organization.queries.getSettings` | `managerQuery` | 選択店舗の事業者設定を必要最小限のDTOで返す |
| `api.organization.mutations.updateOrganizationName` | `authenticatedMutation` | 事業者所属と課金状態を確認して事業者名を変更する |
| `api.organization.mutations.addShop` | `authenticatedMutation` | 有料機能と上限を再確認して店舗を追加する |
| `api.organization.mutations.archiveShop` | `authenticatedMutation` | 事業者所属と復旧権限を確認して店舗をアーカイブする |
| `api.organization.mutations.reactivateShop` | `authenticatedMutation` | 事業者所属と店舗上限を確認して店舗を再稼働する |
| `api.organization.mutations.removePersonFromShop` | `authenticatedMutation` | 将来シフトを確認し、対象店舗のスタッフ所属とアクセスだけを終了する |
| `api.organization.mutations.removePersonFromOrganization` | `authenticatedMutation` | 最後の管理者、請求先、将来シフトを確認し、人物の事業者内アクセスを終了する |
| `api.organization.mutations.removeManagerRole` | `authenticatedMutation` | スタッフ所属を維持したまま管理者権限だけを外すか、所属のない人物のアクセスを終了する |
| `api.staff.mutations.editStaff` | `managerMutation` | 事業者人物と同じ人物の有効な店舗スタッフ情報を同期する |
| `api.organizationInvitation.queries.getPreview` | 公開`query` | 事業者名と期限だけを含む招待プレビューを返す |
| `api.organizationInvitation.mutations.create` | `authenticatedMutation` | 利用枠を予約して管理者招待を作成し、メール通知を予約する |
| `api.organizationInvitation.mutations.resend` | `authenticatedMutation` | 現在の招待を失効させ、新しい招待を発行する |
| `api.organizationInvitation.mutations.revoke` | `authenticatedMutation` | 未承認招待を取り消して予約枠を解放する |
| `api.organizationInvitation.mutations.accept` | `authenticatedMutation` | 確認済みメール、期限、最新性、所属、上限を再確認して招待を承認する |
| `api.organizationBilling.mutations.setFreeSelection` | `authenticatedMutation` | Freeで残す管理者と店舗を保存し、契約制限中は再評価する |
| `api.organizationBilling.mutations.updateBillingEmail` | `authenticatedMutation` | 有効管理者または復旧担当者が請求先メールアドレスを変更する |
| `api.staffRegistration.mutations.submitRegistrationRequest` | 公開`mutation` | 稼働中店舗の公開登録リンクからスタッフ登録申請を作成する |
| `api.staffRegistration.mutations.approveRequest` | `managerMutation` | 最新の契約上限を確認し、予約枠を人物へ付け替えて申請を承認する |

すべてのpublic Convex functionは、runtimeの`args`と`returns` validatorを持つ。
クライアントが渡す事業者ID、店舗ID、人物IDは操作対象の指定であり、認可根拠には使わない。

## Internal API一覧

| API | 種別 | 用途 |
| --- | --- | --- |
| `internal.organizationBilling.mutations.processDeadline` | `internalMutation` | versionと期限を再確認し、Trial終了、猶予終了、期間末変更を適用する |
| `internal.organizationBilling.mutations.setStateFromVerifiedBilling` | `internalMutation` | 検証済みの外部課金結果だけを事業者課金状態へ反映する接続点 |
| `internal.organizationBilling.queries.getNotificationData` | `internalQuery` | 現在の課金状態と所属から課金メールの宛先を再解決する |
| `internal.organizationBilling.actions.enqueueBillingNotification` | `internalAction` | 課金メールを既存Notification Outboxへ重複排除付きで予約する |
| `internal.organizationInvitation.mutations.expire` | `internalMutation` | versionと期限が一致する未承認招待だけを失効させる |
| `internal.organizationInvitation.queries.getEnqueueData` | `internalQuery` | 送信直前に招待、発行者、事業者、課金状態を再確認する |
| `internal.organizationInvitation.queries.getAcceptanceNotificationData` | `internalQuery` | 承認通知の事業者と有効管理者を再解決する |
| `internal.organizationInvitation.actions.enqueueManagerInvitation` | `internalAction` | 管理者招待メールを既存Notification Outboxへ予約する |
| `internal.organizationInvitation.actions.enqueueAcceptanceNotifications` | `internalAction` | 承認者を含む全有効管理者へ承認完了メールを予約する |
| `internal.notificationOutbox.mutations.prepareForDelivery` | `internalMutation` | 外部送信直前に事業者、店舗、所属、課金状態を再確認する |
| `internal.notificationOutbox.mutations.prepareOrganizationManagerInvitationEmail` | `internalMutation` | 招待送信直前に有効性を確認し、生トークンを含まない表示情報を返す |
| `internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications` | `internalMutation` | Free移行または契約制限開始後に未送信の業務通知を停止する |
| `internal.migrations.index.run` | `internalMutation` | 登録済みmigrationを順番に実行する |

`m009`、`m010`、`m011`は`@convex-dev/migrations`のrunnerから順番に実行する内部migrationであり、本番実行はこの実装に含めない。

## 環境変数

- `ORGANIZATION_INVITATION_SIGNING_SECRET`：管理者招待トークンをHMAC-SHA-256で導出する32文字以上のサーバー側秘密値。

秘密値はブラウザへ公開せず、`.env`から`pnpm convex:env-setup`でConvex環境へ同期する。
秘密値を変更すると未承認の招待トークンを検証できなくなるため、変更時は未承認招待を再発行する。

## プラン上限

| プラン | 利用人数上限 | 稼働店舗上限 | 有効管理者上限 |
| --- | ---: | ---: | ---: |
| Trial | 30 | 5 | 30 |
| Free | 4 | 1 | 1 |
| Pro | 15 | 5 | 15 |
| Business | 30 | 5 | 30 |

利用人数は、事業者内の有効なスタッフまたは有効管理者を人物単位で一度だけ数える。
未承認招待は利用人数に含めず、新しい人物への招待が予約した枠を上限判定へ加える。

## 課金状態と操作可否

| 保存状態 | 利用権限 |
| --- | --- |
| `trial` | Trial上限で業務更新と有料機能を許可し、JST基準の終了期限を持つ |
| `initialPaymentPending` | 選択済み有料プランの権利を維持し、初回支払い結果を待つ |
| `pendingActivation` | 支払い成功を確認するまで保存済みのFreeまたは契約制限中の権限を継続し、有料権限は開放しない |
| `active.free` | Free上限で業務更新を許可し、複数店舗と複数管理者などの有料機能を拒否する |
| `active.pro`、`active.business` | 対応する上限で業務更新と有料機能を許可する |
| `scheduledChange` | 期限までは現在の有料プランを維持し、version付き期限処理で変更する |
| `grace` | 猶予期限までは元の有料プランを維持し、期限超過時に再確認して制限へ移す |
| `restricted` | 既存データの閲覧と、指定された復旧担当者による支払い、Free整理、人物削除、店舗アーカイブだけを許可する |

店舗状態は`active`、`archived`、`planSuspended`を区別する。
管理者所属は`active`、`readOnly`、`removed`を区別し、閲覧専用または削除済み所属から通常mutationを実行させない。

再契約または新規契約の支払い確認中を表す`pendingActivation`では、Freeまたは直前の`restricted`状態をversion付きsnapshotとして保持する。
Freeを保持している間はFreeの基本業務を継続でき、`restricted`を保持している間は閲覧と許可済みの復旧操作だけを継続できる。
支払い失敗時は保存済みsnapshotへ戻し、支払い成功が検証されるまで有料権限を開放しない。
期間末変更の取消は検証済み課金イベントだけを受け付け、予約前の有料プランへ戻す。
BusinessからProへの期間末変更は、未承認招待の予約枠を含む利用状況が予約時点でPro上限内の場合だけ保存し、期限時にも再確認する。

## 移行状態

- schemaはWiden状態であり、既存行を受け入れるため一部の事業者参照と店舗状態をoptionalにしている。
- `m009`は店舗名やメールアドレスだけで別店舗を同じ事業者へ統合せず、一店舗一事業者として移行する。
- `m010`と`m011`は利用者ID、正規化済みメールアドレス、氏名を一意に確認できる場合だけ人物を再利用する。
- 同じ移行元店舗を示す事業者、同じ事業者と利用者の管理者所属、同じメールアドレスの人物が重複する場合は任意の一件を採用しない。
- `userId`付きの旧行は参照先ユーザーと人物の恒久IDを優先し、別ユーザーの同一メールや存在しないユーザーを自動統合しない。
- 推測で統合できない行は`organizationMigrationConflicts`へ識別可能な衝突として残す。
- 移行期間は`shopMembers`、`shopBillingStates`、旧スタッフ参照への最小限のfallbackと互換書き込みを残す。

## 外部ゲートと対象外

| 項目 | 状態 |
| --- | --- |
| ProとBusinessの料金、税、請求周期、日割り、返金、未払い請求書 | 未決定であり、この実装では推測しない |
| 既存本番利用者へ割り当てる初期課金状態 | 本番データの確認とプロダクト判断が必要であり、migration実行前に別途決定する |
| Stripe Product、Price、Webhook endpoint、Customer Portal | 外部設定を作成していない |
| Stripe Checkout、Customer Portal、Webhook、Customer同期 | 外部設定と会計判断が揃うまで接続しない |
| 本番migration | migrationコードだけを実装し、本番データへは実行していない |
| 本番デプロイ | この実装では実行していない |
| Narrow | 本番相当環境で新モデルの安定を観測するまで実行しない |
| 旧課金データと履歴の物理削除 | 保持期間、対象件数、復旧手段が決まるまで実行しない |

`setStateFromVerifiedBilling`は将来のStripe連携が検証済み結果を渡すための内部接続点であり、現在のコードがStripeとの通信や署名検証を行うことを意味しない。

## テスト配置

- `convex/organization/*.test.ts`：事業者境界、店舗操作、人物削除、最後の管理者、冪等性。
- `convex/organizationBilling/*.test.ts`：上限、利用人数、JST境界、状態遷移、期限処理、通知。
- `convex/organizationInvitation/*.test.ts`：トークン、期限、単回利用、メール一致、上限、競合、通知。
- `convex/_scenario/organizationBillingLifecycle.test.ts`：複数APIと時間経過をまたぐ課金ライフサイクル。
- `src/components/features/OrganizationSettings/index.stories.tsx`：事業者設定の代表状態と操作後の状態。
- `src/components/features/ManagerInvitationAcceptance/index.stories.tsx`：招待プレビューと承認結果。
- `src/components/features/ShopSwitcher/index.stories.tsx` と `src/components/features/ShopSelection/index.stories.tsx`：事業者と店舗の切り替え。
