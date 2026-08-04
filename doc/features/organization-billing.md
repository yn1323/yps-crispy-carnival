# グループ課金、複数店舗、複数管理者

> 文書種別: feature
>
> コード照合基準: 現在のcheckoutにある実装
>
> 実環境の公開・設定・migration状況: [リリース状態](../manual/release-status.md)

この文書は、グループ課金に関わる現行機能の地図である。
利用者が完了できること、アプリが保証する境界、画面とコードの入口を示す。

料金、状態遷移、招待、削除を含む詳細な業務契約は[グループ課金の業務仕様](../specs/organization-billing-business-flow.md)を正本とする。
Stripe設定、migration確認、障害対応は[グループ課金の運用](../manual/organization-billing.md)を参照する。

## ダークローンチ中の公開範囲

グループ追加、店舗追加、支払い、管理者招待・交代の四つは実装済みで、コード上は未設定時に非公開となる。
実deploymentの設定値と公開状態はこの文書から推定せず、[リリース状態](../manual/release-status.md)の証跡で確認する。
公開状態はConvexの環境変数で決まり、`convex/_lib/config.ts`が読む。
未設定のdeploymentでは閉じた状態になる。

| 環境変数 | 対象 | 閉じている間の挙動 |
|---|---|---|
| `FEATURE_ORGANIZATION_CREATION` | 二つ目以降のグループ作成 | `createOrganization`が拒否し、「設定」タブに作成セクションを描画しない |
| `FEATURE_SHOP_ADDITION` | 店舗の追加と既存人物の複数店舗所属UI | `addShop`が拒否し、「店舗」タブの追加ボタン、スタッフ詳細の「店舗を追加」、スタッフ招待の「他店舗スタッフを招待」を描画しない |
| `FEATURE_BILLING` | プランと支払い | 「プランと支払い」タブを描画しない |
| `FEATURE_MANAGER_INVITATION` | 管理者の追加・交代 | 発行・再送を拒否し、preview・受諾を利用不可へ寄せ、新規・投入済み通知を送らない。設定とスタッフ詳細の管理者操作UIを描画しない |

拒否はサーバー側で行い、画面から導線を消すだけにはしない。
`getSettings`は公開状態を`features`で返すが、これは表示判定であり認可根拠ではない。
`getCurrentUser`は通常画面の入口用に、四つのフラグのORと支払い・店舗所属追加の表示可否を返す。
四つがすべて閉じている間はUserMenuとDashboardから「グループ設定」を描画しないが、`/settings`のrouteと直URLは運用・復旧用に維持する。
旧backendの応答に表示DTOが無い場合は、frontendがfalseへ正規化して入口を表示しない。

`m022_organization_billing_to_complimentary_business`は、全グループの課金状態を支払い不要Businessへ寄せる。
支払い不要BusinessはStripe objectを作らない隔離契約を持つため、この状態でStripeへ到達する経路がなくなる。

グループ削除は閉じない。
所属があるとアカウント削除を依頼できないため、閉じると管理ユーザーが退会できなくなる。
詳細は[アカウント削除](account-deletion.md)を参照する。

管理者招待では、残存招待を減らす`revoke`とinternal `expire`だけを閉じない。
`removeManagerRole`も管理者を増やさない縮退経路としてサーバーAPIを維持するが、管理者招待フラグが閉じている間はスタッフ詳細の管理者権限セクションごと非表示にする。

解放の順序と各段階の作業は[ダークローンチ実装計画](../plans/2026-07-25_ダークローンチ_実装計画.md)にある。

## 誰が何を完了できるか

| 利用者・処理主体 | 完了できること | 主な条件 |
|---|---|---|
| 有効な管理者 | 同じグループの店舗、人物、管理者、プラン、支払い方法を管理する | 認証済み利用者、`active`所属、選択店舗のグループ一致をサーバーで再確認する |
| 既に利用中の管理ユーザー | グループ設定の「設定」から、いまのグループとは別のグループを新しく作る | 自分で作成した有効なグループが3件未満であること。作成回数はrate limitで抑える |
| 復旧担当の管理者 | 契約制限中に、許可されたFree選択、請求先変更、Customer Portalなどの復旧操作を行う | `readOnly`だけでは通常の業務更新やグループ名変更を許可しない |
| 管理者招待の受取人 | 公開後、招待先グループを確認し、ログインまたは登録後に管理者アカウントを連携する | `FEATURE_MANAGER_INVITATION=enabled`、期限内の最新招待、確認済みメールの一致、連携時点の上限と所属を満たす |
| Stripe Webhookと内部worker | 支払い結果、期間末変更、取消、再試行を検証して課金状態へ反映する | 署名、接続mode、provider objectの対応、version、冪等性を検証する |
| 運用担当者 | Stripe設定、probe、Narrow deploy前確認、販売停止、Price rotation、復旧を行う | 実環境を一意に特定し、[運用手順](../manual/organization-billing.md)に従って証跡を残す |

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

## メールアドレスの責務

| 種類 | 正本 | 用途 | 主な変更場所 |
|---|---|---|---|
| ログイン方法 | Clerkの確認済みメール、パスワード、Google接続 | シフトリへの認証 | 画面右上の「ログイン設定」から開く`/account/security` |
| シフト連絡先 | グループごとの`organizationPeople.email` | 本人のシフト通知と管理者向けの業務連絡 | ユーザー詳細 |
| 請求先 | グループごとの`organizations.billingEmail` | Stripeの請求書、領収書、カード関連通知 | 「プランと支払い」 |
| 初期化・旧データ互換値 | `users.email` | 初回セットアップ時のsnapshotとcanonical所属がない旧データのfallback | 通常の設定画面では直接編集しない |

シフト連絡先を変更しても、Clerkのログイン方法、`users.email`、請求先メールアドレスは変更しない。
請求先メールアドレスを変更しても、シフト連絡先とログイン方法は変更しない。
ログイン設定の画面と状態判定はシフト連絡先から独立させ、Clerk操作の提供可否は安全性の実験と環境確認が完了した機能だけを有効にする。
この文書はローカル実装の境界を示すものであり、Clerkの各操作や実deploymentでの公開完了を示す証跡にはしない。

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

## グループの作成

グループ設定からの追加作成は、現在ダークローンチで閉じている。
この節は解放後の契約を示す。

グループを作る入口は二つあり、開始プランが異なる。

| 入口 | 対象 | 開始プラン |
|---|---|---|
| 初回セットアップ（`/dashboard`の店舗登録） | 所属がまだない利用者 | `complimentary.business` |
| グループ設定の「設定」タブ | 既に管理者として利用している利用者 | `active.free` |

支払い不要Businessは製品を体験してもらうための一度きりの提供であり、二つ目以降のグループには付けない。
二つ目以降はFreeの5名、1店舗、管理者1名から始まり、増やす場合は各グループでプランを選ぶ。

自分で作成して保持できるグループは3件までとする。
招待されて所属しているグループはこの上限に数えない。
削除したグループも数えないため、削除すれば再び作成できる。

作成は`requestId`由来のcorrelationIdで冪等化し、同じ要求の再実行でグループを重複作成しない。
利用者単位のrate limitで、連打と削除・再作成の繰り返しを抑える。

新しいグループには、作成した利用者だけが人物と管理者として登録される。
既存グループの人物、スタッフ、店舗、シフトは引き継がない。

初回セットアップで入力したシフト連絡先は、最初のグループ人物、最初の店舗スタッフ、グループの初期請求先へsnapshotする。
`users.email`にも初回値を保存するが、以後のシフト連絡先とログイン方法の正本にはしない。

二つ目以降のグループ作成では、画面が選択中の店舗を`sourceShopId`として渡す。
サーバーは、その店舗のグループで操作本人が有効な管理者であることを確認し、同じuserのactive personを一意に解決できれば、その氏名とシフト連絡先だけを新しいグループ人物、最初の店舗スタッフ、初期請求先へsnapshotする。
別人物の情報、既存スタッフ所属、店舗、シフトは引き継がない。
旧frontendが`sourceShopId`を送らない場合、またはsourceに一意な旧`shopMembers`だけがありcanonical personがまだない移行途中の場合は、`users`のsnapshotへfallbackする。canonical personやmembershipが重複・不整合な場合はfallbackせず拒否する。
作成時の非PII auditには`managerProfile.canonicalPerson`、`managerProfile.legacySourceUserSnapshot`、`managerProfile.omittedSourceUserSnapshot`のいずれかを記録し、旧clientと移行fallbackの収束をメール値なしで確認できるようにする。互換期間終了後の`sourceShopId` required化とfallback削除は別変更で行う。

## 支払い不要Business

初回セットアップで作るグループは`complimentary.business`として開始する。
期限と利用料金はなく、Businessの40名、5店舗、管理者5名を利用できる。

支払い不要Businessでは、Stripe Customer、Subscription、Checkout Session、Portal Session、Invoice、Subscription Schedule、課金operation、課金通知を作らない。
公開API、管理処理、Stripeイベント、再同期処理から通常課金や別状態へ変更しない。

現行コードの保存契約は`complimentary.business`だけを許可する。
`complimentary.pro`は通常runtimeのreader、writer、画面、利用上限、targetingでは扱わない。

`m021_organization_billing_complimentary_pro_to_business`とexport verifierは、旧`complimentary.pro`を新形式へ移した履歴を検証するために残す。
Migration Testの旧shape fixture以外で、`complimentary.pro`を現行契約として作成しない。

対象deploymentのmigration statusとexport検証状況は、[リリース状態](../manual/release-status.md)を正とする。
Narrow版を対象deploymentへdeployする前に、完全修飾deployment名を固定し、m021の完走、旧形式の残件0、未解消conflict 0を[運用手順](../manual/organization-billing.md)で確認して記録する。
このコード契約やローカルテストから、実環境の移行完了を推測しない。

## 管理者招待の安全契約

この節は`FEATURE_MANAGER_INVITATION=enabled`で公開した後の契約を示す。
閉状態では、発行・再送・preview・`linkAccount`・legacy `accept`・招待通知と管理者連携完了通知の配送をサーバー側で止める。
切替直前に連携が完了していても、新しい連携完了通知はenqueueせず、既にOutboxへ投入済みの通知はproviderを呼ばず取消する。
発行済みtokenも受諾できず、フラグを閉じる前にOutboxへ投入済みのメール・LINE通知もprovider呼出前に取消す。

- 招待はメールで送り、発行から7日間有効な一回限りのtokenを使う。
- 招待対象のグループ人物が未接続、またはまだ存在しない場合は、受取人の確認済みメールを正規化し、招待先メールとの完全一致を連携時に確認する。
- 招待対象のグループ人物が既に`userId`へ接続済みなら、その利用者本人だけが承認でき、メール照合をアカウント同一性の代わりにしない。
- 招待対象のグループ人物が未接続、またはまだ存在しない場合は、Node actionがClerk Backend APIから取得した確認済みメール一覧に招待先メールが含まれる場合だけ承認する。
- Clerk providerの設定不足、一時障害、照会失敗では`unavailable`を返し、招待のstatus、version、予約枠を変更せず再試行可能な状態を維持する。
- Node actionの準備処理と確定処理の間では、認証主体、招待ID、version、token digest、確認済みメールをproofで結び、確定時に招待状態と上限を再確認する。
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
| `scheduledChange` | 期間末のプラン変更を予約済み | 期間末までは現在の有料プランを維持する |
| `grace` | 最初に検証された支払い失敗から14日間の猶予中 | 現在の有料権限と復旧操作を維持する |
| `restricted` | 上限超過または課金復旧待ち | 閲覧と許可された復旧操作だけを認める |

状態遷移の前提、通知、期限、上限超過時の分岐は[業務仕様](../specs/organization-billing-business-flow.md)を参照する。

## 画面

| 画面 | 役割 |
|---|---|
| `/settings?shop=<shopId>` | 選択店舗からグループを解決し、ユーザー、店舗、プランと支払い、設定を管理する。四つのフラグがすべて閉じている間も直URLは利用できるが、通常画面からの入口は描画しない |
| `/settings?shop=<shopId>&tab=billing` | 現在のプラン、価格、変更予定、支払い方法、請求先メール、復旧操作を扱う |
| `/manager-invite?token=...` | 公開中は招待previewとアカウント連携を扱う。ダークローンチ中は利用不可を表示する |
| `/dashboard?shop=<shopId>` | 現在のグループと店舗、業務更新可否を表示する |
| `/shops/<shopId>?shop=<contextShopId>` | 同じグループの店舗情報、所属、稼働状態を管理する |
| `/users/<personId>?shop=<shopId>` | グループ人物、管理者権限、店舗所属、招待再送を管理する |

## コードの入口

### バックエンド

| パス | 責務 |
|---|---|
| `convex/setup/mutations.ts` | 初回セットアップと、既存管理者による二つ目以降のグループ作成を受け付ける |
| `convex/setup/service.ts` | グループ、最初の管理者、店舗、初期課金状態を作る共通処理と、作成可否の判定 |
| `convex/_lib/functions.ts` | 認証、グループ所属、選択店舗、課金状態を検証するAPI wrapper |
| `convex/organization/` | グループ、店舗、人物、管理者、利用状況、削除可否を扱う |
| `convex/organizationBilling/` | プラン上限、課金policy、期限、Free選択、請求先メール、通知を扱う |
| `convex/organizationStripe/` | Stripe API、Price、Checkout、Portal、Webhook、再照合、probeを扱う |
| `convex/organizationInvitation/mutations.ts` | 管理者招待の発行、再送、取消、承認準備、proof付き確定、旧mutation互換を扱う |
| `convex/organizationInvitation/acceptanceActions.ts` / `convex/_lib/clerkVerifiedEmailProvider.ts` | 未接続人物のClerk確認済みメールをNode runtimeで照合し、provider失敗時は招待を消費せず返す |
| `convex/migrations/m023_organization_invitations_narrow_prep.ts` | 旧招待lifecycleと欠損fieldをNarrow前に補完する |
| `convex/migrations/m028_shop_billing_states_narrow_prep.ts` | 旧店舗課金rowを保持したままcanonical課金状態との対応異常を記録する |
| `convex/narrowReadiness/queries.ts` | 招待、請求先、Subscription、制限状態をPIIなしで全ページ確認する |
| `convex/notificationOutbox/` | 外部送信前の宛先・所属・課金状態再確認と重複排除を行う |
| `convex/migrations/m021_organization_billing_complimentary_pro_to_business.ts` | 旧`complimentary.pro`を変換した履歴migrationとMigration Testの契約 |
| `convex/migrations/m022_organization_billing_to_complimentary_business.ts` | ダークローンチのため、全課金状態を支払い不要Businessへ寄せる |
| `convex/_lib/config.ts` | ダークローンチ中に公開している導線を環境変数から読む |
| `scripts/verifyComplimentaryBusinessM021Export.ts` | Narrow deploy前にm021前後のexport証跡をfail-closedに検証する |

### フロントエンド

| パス | 責務 |
|---|---|
| `src/pages/settings/` | グループ設定画面の取得と配置 |
| `src/components/features/OrganizationSettings/` | ユーザー、店舗、プランと支払い、管理者招待、グループ作成、削除UI |
| `src/components/features/OrganizationSettings/BillingSettings/` | 価格表示、プラン変更、Portal、請求先メールのcontrollerとdialog |
| `src/components/features/ManagerInvitationAcceptance/` | 招待preview、認証導線、連携結果 |
| `src/pages/account-security/` / `src/components/features/LoginMethods/` | シフト連絡先と独立したログイン設定の画面境界、Clerk状態からの表示判定と操作可否 |
| `src/components/features/AuthenticatedApp/AuthGuard.tsx` | URLと利用可能店舗から有効な操作contextを解決する |
| `src/components/features/Dashboard/` | グループ・店舗contextと閲覧専用状態を表示する |

## 主なAPI入口

すべてのpublic Convex functionは`args`と`returns` validatorを持つ。
次は代表的な入口であり、完全な関数一覧はコードを正とする。

| 入口 | 用途 |
|---|---|
| `api.setup.mutations.setupShopAndManager` | 初期設定と支払い不要Businessの作成 |
| `api.setup.mutations.createOrganization` | 既存管理者による二つ目以降のグループ作成（Free開始、上限3件、冪等） |
| `api.dashboard.queries.getMyShops` | 利用可能な店舗、グループ、所属状態の取得 |
| `api.organization.queries.getSettings` | グループ設定、利用状況、課金状態、操作可否の取得 |
| `api.organization.mutations.*` | グループ名、店舗、人物、管理者、削除の更新 |
| `api.organizationInvitation.queries.getPreview` | 公開中は招待先グループと期限だけを返し、閉状態ではtokenを解決せず`unavailable`を返す |
| `api.organizationInvitation.mutations.createExternal` / `createForPerson` / `createForStaff` | 外部人物または既存人物への管理者招待 |
| `api.organizationInvitation.mutations.resend` / `revoke` | 招待の再送と取消。閉状態では再送を止め、取消だけを維持する |
| `api.organizationInvitation.acceptanceActions.accept` | 接続済み人物のアカウント一致、または未接続人物のClerk確認済みメールを検証して招待を承認 |
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
| `internal.migrations.index.runM021` | Widen期間にm021だけをdry runまたは限定再評価した履歴用runner |

`getProPrice`、`startProCheckout`、`scheduleFreeAtPeriodEnd`、`cancelScheduledFree`は旧クライアント向け互換入口として残す。
`organizationInvitation.mutations.linkAccount`と`organizationInvitation.mutations.accept`もrolling deploy中の旧クライアント向け互換入口であり、新しい画面の標準承認経路にはしない。

## 検証の入口

- `convex/organizationBilling/*.test.ts`：プラン上限、課金状態、期限、通知とm021の旧shape移行fixtureを検証する。
- `convex/organizationStripe/*.test.ts`：Price、Checkout、Webhook、再照合、支払い不要BusinessのStripe隔離、probeを検証する。
- `convex/organizationInvitation/*.test.ts`：token、期限、接続済み人物のアカウント一致、未接続人物のClerk確認済みメール、provider失敗時の非消費、予約枠、再送、連携を検証する。
- `convex/_scenario/organizationBillingLifecycle.test.ts`と`organizationPaidPlanChanges.test.ts`：時間と複数APIをまたぐ課金ライフサイクルを検証する。
- `convex/_scenario/staffManagerInvitation.test.ts`と`organizationManagerExchange.test.ts`：既存人物の招待とFree管理者交代を検証する。
- `convex/setup/mutations.test.ts`と`convex/_scenario/organizationCreation.test.ts`：グループ作成の上限、冪等性、rate limit、Free開始、既存グループへの非混入を検証する。
- `src/components/features/OrganizationSettings/OrganizationCreation/OrganizationCreationSection.stories.tsx`と`controllers.test.tsx`：グループ作成の代表状態、mutation引数、作成後の遷移を検証する。
- `src/components/features/OrganizationSettings/PlanAndPaymentSection.stories.tsx`と`BillingSettings/`配下のStory・Logic Test：Free、Pro、Businessの代表状態と主要変更操作を検証する。
- `src/components/features/OrganizationSettings/ManagerInvitation/ManagerInvitationDialog.stories.tsx`：管理者招待の代表状態と操作を検証する。

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
