# グループ課金、複数店舗、複数管理者

> 文書種別: feature
>
> コード照合基準: `b61100a680e80d154a74f576d03c53712846e062`
>
> 実環境の公開・設定・migration状況: [リリース状態](../manual/release-status.md)

この文書は、グループ課金に関わる現行機能の地図である。
利用者が完了できること、アプリが保証する境界、画面とコードの入口を示す。

料金、状態遷移、招待、削除を含む詳細な業務契約は[グループ課金の業務仕様](../specs/organization-billing-business-flow.md)を正本とする。
Stripe設定、migration確認、障害対応は[グループ課金の運用](../manual/organization-billing.md)を参照する。

## 誰が何を完了できるか

| 利用者・処理主体 | 完了できること | 主な条件 |
|---|---|---|
| 有効な管理者 | 同じグループの店舗、人物、管理者、プラン、支払い方法を管理する | 認証済み利用者、`active`所属、選択店舗のグループ一致をサーバーで再確認する |
| 復旧担当の管理者 | 契約制限中に、許可されたFree選択、請求先変更、Customer Portalなどの復旧操作を行う | `readOnly`だけでは通常の業務更新やグループ名変更を許可しない |
| 管理者招待の受取人 | 招待先グループを確認し、ログインまたは登録後に管理者アカウントを連携する | 期限内の最新招待、確認済みメールの一致、連携時点の上限と所属を満たす |
| Stripe Webhookと内部worker | 支払い結果、期間末変更、取消、再試行を検証して課金状態へ反映する | 署名、接続mode、provider objectの対応、version、冪等性を検証する |
| 運用担当者 | Stripe設定、probe、m021確認、販売停止、Price rotation、復旧を行う | 実環境を一意に特定し、[運用手順](../manual/organization-billing.md)に従って証跡を残す |

同じ管理者が無関係な複数グループに所属していても、`?shop=`で選択した店舗から操作対象のグループを一意に解決する。
クライアントが渡すグループID、店舗ID、人物IDは対象の指定であり、認可根拠には使わない。

## 機能の地図

| 要素 | 役割 |
|---|---|
| グループ（`organizations`） | 契約、利用上限、管理権限の境界 |
| 店舗（`shops`） | 日常業務で選択する操作対象。必ず一つのグループに属する |
| 人物（`organizationPeople`） | グループ内の利用人数を数える正本。スタッフ兼管理者でも重複計上しない |
| 管理者所属（`organizationMembers`） | 管理画面の権限。`active`、復旧専用の`readOnly`、失効済みの`removed`を持つ |
| 課金状態（`organizationBillingStates`） | Trial、Free、Pro、Business、支払い不要Businessと遷移中の状態を保持する |
| Stripe対応表とoperation | 有料契約のCustomer、Subscription、非同期処理をグループ単位で追跡する |
| 管理者招待（`organizationInvitations`） | メールの受取人へ、管理者アカウントを一回だけ連携できる権限を渡す |

## 保証する範囲

### グループと権限の境界

- 管理者APIは、認証identityから利用者と所属を解決し、選択店舗が同じグループに属することを毎回確認する。
- URLの`shop`は`getMyShops`の候補と照合してから採用する。
  明示されたURLが候補外なら、別グループや別店舗へ暗黙にfallbackしない。
- 管理者権限を外しても、グループ内の人物と既存のスタッフ所属は維持する。
- 契約制限へ切り替わった画面は書込ダイアログを閉じ、ShiftBoardの未保存編集を永続化済みデータへ戻す。
- 店舗・人物・グループの削除条件と保持情報は[データ削除](data-deletion.md)を正本とする。

### プランと利用上限

| 表示・利用権限 | 利用人数 | 稼働店舗 | 有効管理者 | Stripe契約 |
|---|---:|---:|---:|---|
| Trial | 20 | 5 | 5 | 継続予約がある場合だけ作成処理を持つ |
| Free | 5 | 1 | 1 | なし |
| Pro | 20 | 5 | 5 | あり |
| Business | 40 | 5 | 5 | あり |
| 支払い不要Business | 40 | 5 | 5 | 作成しない |

Trialの利用権限はProと同じである。
利用人数はグループ内の人物を一度だけ数え、複数店舗所属やスタッフ兼管理者で重複させない。
店舗追加、人物追加、管理者招待、プラン変更は、開始時と確定時に最新の上限と予約枠を再確認する。

### 課金結果と外部副作用

- 有料プランの状態変更は、署名済みWebhookまたはStripe APIから再取得した結果だけを`setStateFromVerifiedBilling`へ渡す。
  CheckoutやPortalの戻り先を支払い成功の根拠にしない。
- Secret keyの接頭辞、Stripe objectの`livemode`、Price、Customer、Subscription、Invoiceの対応を検証する。
- Stripe Event ID、request ID、operationのidempotency keyで重複実行を収束させる。
- ProからBusinessへの即時変更は、支払い成功を確認するまでProの利用権限を維持する。
- BusinessからPro、または有料プランからFreeへの変更は期間末に予約し、providerで確認できた結果だけを反映する。
- カード番号、CVC、有効期限をアプリの引数、DB、ログへ保存しない。
- 課金・招待通知はNotification Outboxへ積み、外部送信直前にグループ、所属、課金version、現在の宛先を再確認する。

## 支払い不要Businessとm021

新規初期設定で作るグループは`complimentary.business`として開始する。
期限と利用料金はなく、Businessの40名、5店舗、管理者5名を利用できる。

支払い不要Businessでは、Stripe Customer、Subscription、Checkout Session、Portal Session、Invoice、Subscription Schedule、課金operation、課金通知を作らない。
公開API、管理処理、Stripeイベント、再同期処理から通常課金や別状態へ変更しない。

Widen期間中の`complimentary.pro`は、画面、利用上限、targetingで支払い不要Businessとして扱う。
`m021_organization_billing_complimentary_pro_to_business`は、次の条件をすべて満たす行だけを`complimentary.business`へ変更する。

- グループが存在し、課金状態が一意である。
- Stripe Customer、Subscription、全statusのoperation、Webhook証跡がない。
- 課金通知と先行したm021監査がない。

条件を満たさない行は推測で変更せず、理由別のmigration conflictへ残す。
実環境でm021が完了したかはこの文書から推測せず、[リリース状態](../manual/release-status.md)で確認する。

## 管理者招待の安全契約

- 招待はメールで送り、発行から7日間有効な一回限りのtokenを使う。
- 受取人の確認済みメールを正規化し、招待先メールとの完全一致を連携時に確認する。
- 発行時と連携時の両方で、管理者追加権限、人物上限、管理者上限、予約枠をサーバー側で確認する。
- 再送は旧招待を失効させ、tokenをローテーションする。
- 生tokenをNotification Outboxへ保存せず、送信直前にサーバー側秘密値から導出する。
- 外部人物は招待発行時に人物や所属を作らず、アカウント連携が成功したtransaction内で初めて作る。
- Freeの管理者交代は、後任の連携と同じtransactionで旧管理者の管理権限を失効する。
  旧管理者の人物情報と既存スタッフ所属は維持する。
- 期限切れ、取消、上限超過、メール不一致、所属不整合では管理者権限を作らない。

## 主要な課金状態

| 状態 | 利用者から見た意味 | 書込・復旧の扱い |
|---|---|---|
| `trial` | 無料体験中。Pro相当を利用する | 継続先としてProまたはBusinessを選べる |
| `initialPaymentPending` | Trial終了時の初回支払い結果を確認中 | Pro相当を維持し、検証済み結果を待つ |
| `pendingActivation` | Free、Pro、制限状態から有料プランを有効化中 | 保存したfallbackの権限を維持する |
| `active.free` | Freeを利用中 | 5名、1店舗、管理者1名に限定する |
| `active.pro` | Proを利用中 | 20名、5店舗、管理者5名を許可する |
| `active.business` | Businessを利用中 | 40名、5店舗、管理者5名を許可する |
| `complimentary.business` | 支払い不要Businessを利用中 | Business権限を許可し、Stripe処理を拒否する |
| `complimentary.pro` | m021前の保存互換状態 | 支払い不要Businessと同じ権限で読み取る |
| `scheduledChange` | 期間末のプラン変更を予約済み | 期間末までは現在の有料プランを維持する |
| `grace` | 最初に検証された支払い失敗から14日間の猶予中 | 現在の有料権限と復旧操作を維持する |
| `restricted` | 上限超過または課金復旧待ち | 閲覧と許可された復旧操作だけを認める |

状態遷移の前提、通知、期限、上限超過時の分岐は[業務仕様](../specs/organization-billing-business-flow.md)を参照する。

## 画面

| 画面 | 役割 |
|---|---|
| `/settings?shop=<shopId>` | 選択店舗からグループを解決し、ユーザー、店舗、プランと支払い、設定を管理する |
| `/settings?shop=<shopId>&tab=billing` | 現在のプラン、価格、変更予定、支払い方法、請求先メール、復旧操作を扱う |
| `/manager-invite?token=...` | 公開範囲を限定した招待previewを表示し、認証後にアカウントを連携する |
| `/dashboard?shop=<shopId>` | 現在のグループと店舗、業務更新可否を表示する |
| `/shops/<shopId>?shop=<contextShopId>` | 同じグループの店舗情報、所属、稼働状態を管理する |
| `/users/<personId>?shop=<shopId>` | グループ人物、管理者権限、店舗所属、招待再送を管理する |

## コードの入口

### バックエンド

| パス | 責務 |
|---|---|
| `convex/setup/mutations.ts` | グループ、最初の管理者、店舗、支払い不要Businessを一つの初期設定で作る |
| `convex/_lib/functions.ts` | 認証、グループ所属、選択店舗、課金状態を検証するAPI wrapper |
| `convex/organization/` | グループ、店舗、人物、管理者、利用状況、削除可否を扱う |
| `convex/organizationBilling/` | プラン上限、課金policy、期限、Free選択、請求先メール、通知を扱う |
| `convex/organizationStripe/` | Stripe API、Price、Checkout、Portal、Webhook、再照合、probeを扱う |
| `convex/organizationInvitation/` | 管理者招待の発行、再送、取消、preview、アカウント連携を扱う |
| `convex/notificationOutbox/` | 外部送信前の宛先・所属・課金状態再確認と重複排除を行う |
| `convex/migrations/m021_organization_billing_complimentary_pro_to_business.ts` | Stripeから隔離された`complimentary.pro`だけを移行する |
| `scripts/verifyComplimentaryBusinessM021Export.ts` | m021前後のexportをfail-closedに検証する |

### フロントエンド

| パス | 責務 |
|---|---|
| `src/pages/settings/` | グループ設定画面の取得と配置 |
| `src/components/features/OrganizationSettings/` | ユーザー、店舗、プランと支払い、管理者招待、削除UI |
| `src/components/features/OrganizationSettings/BillingSettings/` | 価格表示、プラン変更、Portal、請求先メールのcontrollerとdialog |
| `src/components/features/ManagerInvitationAcceptance/` | 招待preview、認証導線、連携結果 |
| `src/components/features/AuthenticatedApp/AuthGuard.tsx` | URLと利用可能店舗から有効な操作contextを解決する |
| `src/components/features/Dashboard/` | グループ・店舗contextと閲覧専用状態を表示する |

## 主なAPI入口

すべてのpublic Convex functionは`args`と`returns` validatorを持つ。
次は代表的な入口であり、完全な関数一覧はコードを正とする。

| 入口 | 用途 |
|---|---|
| `api.setup.mutations.setupShopAndManager` | 初期設定と支払い不要Businessの作成 |
| `api.dashboard.queries.getMyShops` | 利用可能な店舗、グループ、所属状態の取得 |
| `api.organization.queries.getSettings` | グループ設定、利用状況、課金状態、操作可否の取得 |
| `api.organization.mutations.*` | グループ名、店舗、人物、管理者、削除の更新 |
| `api.organizationInvitation.queries.getPreview` | 招待先グループと期限だけを返す公開preview |
| `api.organizationInvitation.mutations.createExternal` / `createForPerson` / `createForStaff` | 外部人物または既存人物への管理者招待 |
| `api.organizationInvitation.mutations.resend` / `revoke` / `linkAccount` | 招待の再送、取消、アカウント連携 |
| `api.organizationBilling.mutations.setFreeSelection` | Freeで残す管理者と店舗の選択 |
| `api.organizationBilling.mutations.updateBillingEmail` | 請求先メールの更新とStripe同期予約 |
| `api.organizationStripe.actions.getPlanPrice` / `startPaidCheckout` | Pro・Businessの価格確認と契約開始 |
| `api.organizationStripe.actions.previewPaidPlanChange` / `changePaidPlanNow` | ProからBusinessへの日割りpreviewと即時変更 |
| `api.organizationStripe.actions.schedulePaidPlanChange` / `cancelScheduledPlanChange` | 期間末のプラン変更と取消 |
| `api.organizationStripe.actions.openCustomerPortal` | 支払い方法と請求履歴を扱う一時Portal URLの作成 |
| `api.organizationStripe.actions.cancelTrialContinuation` | Trial後の継続予約取消 |
| `POST /stripe/webhook` | 署名済みStripeイベントの受信 |
| `internal.organizationBilling.mutations.processDeadline` | Trial、猶予、期間末変更の期限処理 |
| `internal.organizationBilling.mutations.setStateFromVerifiedBilling` | 検証済みの課金結果を状態へ反映する唯一の接続点 |
| `internal.organizationStripe.actions.processWebhookEvent` | 受信済みWebhookの再取得、重複排除、状態反映 |
| `internal.organizationStripe.maintenance.getProbe` | Webhook、operation、対応関係、異常のbounded観測 |
| `internal.organizationStripe.maintenance.recoverWebhookEvents` / `recoverSafeOperations` | 再開可能なWebhookと安全operationのbounded回収 |
| `internal.migrations.index.runM021` | m021限定のdevelopment dry runと限定再評価 |

`getProPrice`、`startProCheckout`、`scheduleFreeAtPeriodEnd`、`cancelScheduledFree`、`organizationInvitation.mutations.accept`は旧クライアント向け互換入口として残す。

## 検証の入口

- `convex/organizationBilling/*.test.ts`：プラン上限、課金状態、期限、通知、m021を検証する。
- `convex/organizationStripe/*.test.ts`：Price、Checkout、Webhook、再照合、支払い不要BusinessのStripe隔離、probeを検証する。
- `convex/organizationInvitation/*.test.ts`：token、期限、メール一致、予約枠、再送、連携を検証する。
- `convex/_scenario/organizationBillingLifecycle.test.ts`と`organizationPaidPlanChanges.test.ts`：時間と複数APIをまたぐ課金ライフサイクルを検証する。
- `convex/_scenario/staffManagerInvitation.test.ts`と`organizationManagerExchange.test.ts`：既存人物の招待とFree管理者交代を検証する。
- `scripts/verifyComplimentaryBusinessM021Export.test.ts`：m021のpre/post export契約を検証する。
- `src/components/features/OrganizationSettings/**/*.stories.tsx`：プランと支払い、管理者招待の代表状態と操作を検証する。
- `e2e/scenarios/organization-billing-plan-change.test.ts`：Free、Pro、Businessの主要変更導線を検証する。

## 仕様・規約・運用

| 種別 | 正本・参照先 |
|---|---|
| 詳細な業務契約 | [グループ課金の業務仕様](../specs/organization-billing-business-flow.md) |
| セキュリティ | [セキュリティ戦略](../rules/security-strategy.md) |
| Convex設計 | [Convex設計戦略](../rules/convex-design-strategy.md) |
| テスト配置 | [テスト戦略](../rules/testing-strategy.md) |
| Stripe・migration・障害対応 | [グループ課金の運用](../manual/organization-billing.md) |
| 実環境の確認結果 | [リリース状態](../manual/release-status.md) |
| リリース全般 | [CI/CD運用](../manual/ci-cd.md) |
| セキュリティcanary | [セキュリティ再検証](../manual/security-validation.md) |
| 削除契約 | [データ削除](data-deletion.md) |
| 意思決定と実装履歴 | [実装計画INDEX](../plans/INDEX.md) |

`doc/plans/`は意思決定と実装履歴であり、現在仕様や実環境状態の正本にはしない。
