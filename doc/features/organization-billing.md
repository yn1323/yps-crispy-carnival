# 組織課金、複数店舗、複数管理者

> 文書種別: 現行実装仕様（feature）
>
> コード照合基準: 現在のcheckoutにある実装
>
> 実環境の公開・設定・migration状況: [リリース状態](../manual/release-status.md)

この文書は、組織課金に関わる現行機能の地図である。
利用者が完了できること、アプリが保証する境界、画面とコードの入口を示す。

料金、状態遷移、招待、削除を含む詳細な業務要件は[組織課金の業務要件](../specs/organization-billing-business-flow.md)を正本とする。
Stripe設定、migration確認、障害対応は[組織課金の運用](../manual/organization-billing.md)を参照する。

## 公開範囲

repository artifactでは、追加組織、複数店舗、複数管理者、Stripe課金を常時利用できる。
機能ごとの公開環境変数は使わず、画面の導線を常時表示する。  操作できない場合は、認証・所属状態、契約状態、プラン上限、Stripe設定など、実際の理由を画面へ示す。

direct routeとpublic mutation/actionは、画面表示とは独立して認証、所属、店舗境界、課金状態、利用上限をサーバー側で確認する。  招待token、通知、Stripe operation、Webhookのrate limit、冪等性、dedupe、再送安全性も維持する。

実deploymentへの反映状況はこの文書から推定せず、[リリース状態](../manual/release-status.md)の証跡で確認する。
`/dashboard`は選択中の組織と店舗を表示し、管理画面から組織、店舗、管理者、プランと支払いを開ける。

組織削除は閉じない。
所属があるとアカウント削除を依頼できないため、閉じると管理ユーザーが退会できなくなる。
詳細は[アカウント削除](account-deletion.md)を参照する。

当初の解放順序は[ダークローンチ実装計画](../plans/2026-07-25_ダークローンチ_実装計画.md)に履歴として残す。
現在の公開契約はこの文書を正とする。

## 誰が何を完了できるか

| 利用者・処理主体 | 完了できること | 主な条件 |
|---|---|---|
| 有効な管理者 | 組織、店舗、人物、管理者、契約を管理する | 認証済み利用者、`active`所属、対象組織と店舗の一致、契約状態、プラン上限をサーバーで再確認する |
| 組織所属がない認証済み利用者 | `/dashboard`のSetupから最初の1組織、1店舗、管理者本人を作る | 所属0件をserver-sideで再確認する。任意のプロモーションコードが空欄なら3か月のTrial、前後空白除去・大文字化後にserver-only設定と一致する場合は`complimentary.pro`で作成し、入力済みのコードが適用できない場合は作成しない |
| 組織所属がある認証済み利用者 | 上限内で追加のFree組織を作る | 作成者本人、組織数上限、rate limit、`requestId`、参照元店舗の所属をサーバーで再確認する |
| Stripe Webhookと内部worker | 既存の支払い結果、期間末変更、取消、再試行を検証して課金状態へ反映する | 署名、接続mode、provider objectの対応、version、冪等性を検証する |
| 運用担当者 | Stripe設定、probe、Narrow deploy前確認、販売停止、Price rotation、復旧を行う | 実環境を一意に特定し、[運用手順](../manual/organization-billing.md)に従って証跡を残す |

`/manage*`はURLで検証済みの`org`を操作対象の正本とし、先頭店舗、Home店舗、browser storageの店舗IDを組織操作や課金の認可anchorにしない。
クライアントが渡す組織ID、店舗ID、人物IDは対象の指定であり、認可根拠には使わない。  サーバーは認証identityからcanonicalな`organizationMembers`と`organizationPeople`を毎回解決し、readOnlyとBusiness write capabilityを再検証する。

### `/manage`の管理導線

- `/manage?org=<organizationId>`は`getManageOverview`で組織名、課金状態、利用数、店舗状態別件数、操作可否だけを購読し、店舗実体をoverviewへ埋め込まない。
- 店舗一覧は`listOrganizationShops`をcursor paginationし、activeだけでなくarchivedも表示する。  プラン上限の5件を保存済み店舗の取得上限に流用せず、過去店舗を欠落させない。
- 組織名、現在店舗、組織削除は既存Dialogとcontrollerを再利用する。  組織作成、店舗追加、管理者招待、請求先変更、Stripe操作の入口は常時表示し、操作可否はサーバーが返すcapabilityに従う。
- CheckoutとCustomer Portalを開始した場合、復帰先は`/manage/billing?org=<organizationId>`にする。  復帰URLだけで支払い成功とは判断せず、Webhookまたはprovider再取得結果を正本とする。
- `pendingActivation`で課金ページを表示した場合は、戻りqueryの有無にかかわらず、サーバーが対象Sessionを組織、operation、Customer、Price、modeに照合する。  Sessionが`open`なら自動で取り消さず、「支払いを続ける」と「支払いをやめる」を表示する。  明示的に支払いをやめた場合だけStripeで`expired`へ確定してから、支払い失敗時のfallbackへ戻す。
- Checkoutから`stripe=cancelled`で戻った場合も同じサーバー照合を行い、`open`なら明示キャンセルとして`expired`へ収束させる。  `complete`やprovider取得失敗では状態を変更せず、Webhookまたは再試行を待つ。  ブラウザバックは`cancel_url`を通らず、bfcache復元ではReactが再マウントされない場合もあるため、戻りqueryだけでなく課金ページの初回表示と`pageshow`復元を再照合の起点にする。
- query errorはページ内で再試行できる。旧`readOnly`所属が残る場合は内容を閲覧できるが変更入口を無効にする。
  上限超過中の整理操作と旧`restricted` stateの移行前操作は、課金policyが返すcapabilityに従う。

## 機能の地図

| 要素 | 役割 |
|---|---|
| 組織（`organizations`） | 契約、利用上限、管理権限の境界 |
| 店舗（`shops`） | 日常業務で選択する操作対象。必ず一つの組織に属する |
| 人物（`organizationPeople`） | 組織内の利用人数を数える正本。スタッフ兼管理者でも重複計上しない |
| 管理者所属（`organizationMembers`） | 管理画面の権限。現行の有効状態`active`、失効済みの`removed`、旧`restricted`移行用の内部互換値`readOnly`を持つ |
| 課金状態（`organizationBillingStates`） | Trial、Standard（`standard`）、Pro（`pro`）、Free、支払い不要Pro相当と遷移中の状態を保持する。旧plan IDと旧`restricted`はrolling deployのread互換期間だけ受け付ける |
| Stripe対応表とoperation | 有料契約のCustomer、Subscription、非同期処理を組織単位で追跡する |
| 管理者招待（`organizationInvitations`） | メールの受取人へ、管理者アカウントを一回だけ連携できる権限を渡す |

## メールアドレスの責務

| 種類 | 正本 | 用途 | 主な変更場所 |
|---|---|---|---|
| ログイン方法 | Clerkの確認済みメール、パスワード、Google接続 | シフトリへの認証 | 画面右上の「アカウント設定」から開く`/account` |
| シフト連絡先 | 組織ごとの`organizationPeople.email` | 本人のシフト通知と管理者向けの業務連絡 | ユーザー詳細 |
| 請求先 | 組織ごとの`organizations.billingEmail` | Stripeの請求書、領収書、カード関連通知 | 「プランと支払い」 |
| 初期化・旧データ互換値 | `users.email` | 初回セットアップ時のsnapshotとcanonical所属がない旧データのfallback | 通常の設定画面では直接編集しない |

シフト連絡先を変更しても、Clerkのログイン方法、`users.email`、請求先メールアドレスは変更しない。
請求先メールアドレスを変更しても、シフト連絡先とログイン方法は変更しない。
請求先メールアドレスはStripeと課金通知の宛先となる文字列であり、管理者ロール、人物の権限、管理者交代、人物・アカウント削除の可否には使用しない。
アカウント設定の画面と状態判定はシフト連絡先から独立させ、Clerk操作の提供可否は安全性の実験と環境確認が完了した機能だけを有効にする。
この文書はローカル実装の境界を示すものであり、Clerkの各操作や実deploymentでの公開完了を示す証跡にはしない。

## 保証する範囲

### 組織と権限の境界

- 管理者APIは、認証identityから利用者と所属を解決し、選択店舗が同じ組織に属することを毎回確認する。
- URLの`shop`は`getMyShops`の候補と照合してから採用する。
  明示されたURLが候補外なら、別組織や別店舗へ暗黙にfallbackしない。
- 管理者権限を外しても、組織内の人物と既存のスタッフ所属は維持する。
- 管理者も個別店舗または全店舗のスタッフ所属を解除できる。
  店舗所属の解除では組織の管理者権限と組織人物を維持する。
- 管理者人物を組織から削除するには、先に管理者権限を外す。
  最後のactive管理者の権限は外せない。
- 通常業務を書き込めない状態へ切り替わった画面は書込ダイアログを閉じ、ShiftBoardの未保存編集を永続化済みデータへ戻す。
- 店舗・人物・組織の削除条件と保持情報は[データ削除](data-deletion.md)を正本とする。

### プランと利用上限

| 表示・利用権限 | 利用人数 | 稼働店舗 | 有効管理者 | Stripe契約 |
|---|---:|---:|---:|---|
| Trial | 50 | 5 | 5 | 継続予約がある場合だけ作成処理を持つ |
| Free | 5 | 1 | 2 | なし |
| Standard | 25 | 5 | 5 | あり |
| Pro | 50 | 5 | 5 | あり |
| 支払い不要Pro相当 | 50 | 5 | 5 | 作成しない |

Trialの利用権限はProと同じである。
Freeは追加組織の初期状態、既存の`active.free`、そのFreeをfallbackとする`pendingActivation`、Trial未契約終了、有料契約終了後の受け皿として維持する。
以下でFreeの管理者操作を説明するときは、`active.free`とFreeをfallbackとする`pendingActivation`を対象にする。
通常の初回Setupは、プロモーションコードを入力せず3か月のTrialで作る。
有効なプロモーションコードを入力した初回Setupは、支払い不要Pro相当の`complimentary.pro`で作る。
明示的に公開した追加組織はFreeで始める。
Trial未契約終了、有料契約の解約、支払い猶予終了、Stripe側の想定外終了では、provider側の終了を確認した後にFreeへ移す。
このFree移行では契約終了時点の未承認招待を失効させるが、管理者、店舗、人物、スタッフ所属、シフトは変更しない。
利用人数は組織内の人物を一度だけ数え、複数店舗所属やスタッフ兼管理者で重複させない。
組織を上限超過として扱う判定には、現在有効な人物、稼働店舗、有効管理者の実数を使い、未承認招待を含めない。
店舗追加、人物追加、管理者招待は、開始時と確定時に未承認招待を含む見込み値も確認する。

上限超過は課金状態として保存しない。
現在のプランと利用実数から、`withinLimits`、`overLimit`、安全に評価しきれない`unknown`を都度導出する。
`overLimit`と`unknown`では、既存データの閲覧、組織人物の削除、管理者権限解除、店舗のアーカイブまたは削除、管理者招待取消、上位プランへの変更、請求先変更、組織削除、アカウント削除に必要な所属整理だけを許可する。
募集、シフト、スタッフ情報、希望シフト提出、店舗再稼働、招待発行、業務通知などの通常業務は停止する。
利用実数を上限内まで減らすと、billing state、scheduler、解除フラグを更新せず通常利用へ戻る。

### 課金結果と外部副作用

- 有料プランの状態変更は、署名済みWebhookまたはStripe APIから再取得した結果だけを`setStateFromVerifiedBilling`へ渡す。
  CheckoutやPortalの戻り先を支払い成功の根拠にしない。
- Secret keyの接頭辞、Stripe objectの`livemode`、Price、Customer、Subscription、Invoiceの対応を検証する。
- StandardとProの金額、通貨、請求周期はStripe Priceを正本とし、コード、環境変数、DBへ周期を複製しない。  新規販売ではactiveなrecurring Priceと正の`interval_count`を要求し、両プランの通貨と請求周期が一致する場合だけProの価格表示、Checkout、プラン間変更を許可する。
- Stripe Event ID、request ID、operationのidempotency keyで重複実行を収束させる。
- StandardからProへの即時変更は、支払い成功を確認するまでStandardの利用権限を維持する。
- ProからStandardへの変更と、有料プランの解約は期間末に予約し、providerで確認できた結果だけを反映する。
- ProからStandardへの変更をproviderで確認した後は、Standard上限を超えていても`active.standard`を適用し、超過分の整理を求める。
- 支払い猶予終了では、未払いとSubscription終了、請求回収停止を確認してから`active.free`へ移す。
- 解約の予約には新契約を示すmarkerを保存し、同じ`targetPlan: "free"`を使うdeployment前の旧Free予約と区別する。
- カード番号、CVC、有効期限をアプリの引数、DB、ログへ保存しない。
- 課金・招待通知はNotification Outboxへ積み、外部送信直前に組織、所属、課金version、現在の宛先を再確認する。

## 組織の作成

組織作成は、組織所属0件の本人による初回Setupと、既存管理者による追加作成の二つを提供する。

| 入口 | 対象 | 開始プラン |
|---|---|---|
| 初回セットアップ（`/dashboard`） | 所属がまだない利用者 | コード空欄では`trial`、有効なコードでは`complimentary.pro` |
| 追加組織作成 | 既存組織のactive管理者 | `active.free` |

初回Setupは本人のactiveな組織所属が0件であることをserver-sideで確認する。
プロモーションコードは6桁の英数字を任意入力とし、空欄なら最初の組織、店舗、人物、管理者、店舗スタッフと、Pro相当の3か月Trialを一度だけ作る。  Trial期限と課金deadlineは作るが、Stripe objectは作らない。
入力値が前後空白除去・大文字化後にserver-only設定と一致する場合は、Trialに代えてcanonicalな`complimentary.pro`を作る。  この場合は期限と課金deadlineを作らず、Stripe object、課金operation、課金通知も作らない。
入力済みのコードが形式不正、設定不備、不一致のいずれかで適用できない場合は、Trialへfallbackせず初回Setup全体を拒否する。  コード値はDB、audit、analytics、ログへ保存しない。
画面の「適用」は、所属0件の本人だけが呼べる副作用なしの事前照合である。  成功表示は権限を付与するcapabilityではなく、最終`setupShopAndManager`も現在のserver-only設定と所属状態を独立して再確認する。

追加組織は管理画面から作成できる。  serverは認証、作成元組織の管理者状態、Free枠、作成上限、rate limit、冪等性をwriteより前に確認する。

自分で作成して保持できる組織は3件までとする。
招待されて所属している組織はこの上限に数えない。
削除した組織も数えないため、削除すれば再び作成できる。

作成は`requestId`由来のcorrelationIdで冪等化し、同じ要求の再実行で組織を重複作成しない。
利用者単位のrate limitで、連打と削除・再作成の繰り返しを抑える。

新しい組織には、作成した利用者だけが人物と管理者として登録される。
既存組織の人物、スタッフ、店舗、シフトは引き継がない。

初回セットアップで入力したシフト連絡先は、最初の組織人物、最初の店舗スタッフ、組織の初期請求先へsnapshotする。
`users.email`にも初回値を保存するが、以後のシフト連絡先とログイン方法の正本にはしない。

二つ目以降の組織作成では、画面が選択中の店舗を`sourceShopId`として渡す。
サーバーは、その店舗の組織で操作本人が有効な管理者であることを確認し、同じuserのactive personを一意に解決できれば、その氏名とシフト連絡先だけを新しい組織人物、最初の店舗スタッフ、初期請求先へsnapshotする。
別人物の情報、既存スタッフ所属、店舗、シフトは引き継がない。
旧frontendが`sourceShopId`を送らない場合、またはsourceに一意な旧`shopMembers`だけがありcanonical personがまだない移行途中の場合は、`users`のsnapshotへfallbackする。canonical personやmembershipが重複・不整合な場合はfallbackせず拒否する。
作成時の非PII auditには`managerProfile.canonicalPerson`、`managerProfile.legacySourceUserSnapshot`、`managerProfile.omittedSourceUserSnapshot`のいずれかを記録し、旧clientと移行fallbackの収束をメール値なしで確認できるようにする。互換期間終了後の`sourceShopId` required化とfallback削除は別変更で行う。

## 支払い不要Pro相当

既存の支払い不要Pro相当の組織は内部状態`complimentary.pro`へ移行して維持し、有効なプロモーションコードを入力した初回Setupも同じcanonical状態で作成する。
期限と利用料金はなく、Proの50名、5店舗、管理者5名を利用できる。

支払い不要Pro相当では、Stripe Customer、Subscription、Checkout Session、Portal Session、Invoice、Subscription Schedule、課金operation、課金通知を作らない。
公開API、管理処理、Stripeイベント、再同期処理から通常課金や別状態へ変更しない。

現行writerのcanonicalな保存契約は`planIdVersion: 2`を伴う`complimentary.pro`である。
Widen中は旧`complimentary.business`を含むmarkerなしの課金状態も読み取り、m042でcanonicalなv2へ変換する。  `planIdVersion`は移行中だけ保存する識別子であり、課金状態とStripe snapshotの移行、旧`restricted` / `readOnly`の0件確認が終わるNarrow時に旧ID互換とともに削除する。

`m021_organization_billing_complimentary_pro_to_business`とexport verifierは、当時の`complimentary.pro`を旧`complimentary.business`へ移した履歴を検証するために残す。  現行IDへの移行で履歴migrationを書き換えない。

`m022_organization_billing_to_complimentary_business`は、全組織を現在の表示でいう支払い不要Pro相当へ寄せるために実装された履歴migrationである。
現行の初回Setupはこのmigrationを呼ばず、コード空欄では新規組織をTrial、有効なコードでは直接`complimentary.pro`で作成する。
repositoryにmigrationがあることから、対象deploymentでの実行完了を推測しない。

対象deploymentのmigration statusとexport検証状況は、[リリース状態](../manual/release-status.md)を正とする。
Narrow版を対象deploymentへdeployする前に、完全修飾deployment名を固定し、m042〜m047の完走、課金互換readinessの全ページblocking 0、旧店舗課金row 0、未解消conflict 0を[運用手順](../manual/organization-billing.md)で確認して記録する。
このコード契約やローカルテストから、実環境の移行完了を推測しない。

## 管理者招待の安全契約

管理者招待は管理画面から利用できる。
取消、期限切れ処理、残存招待を減らすcleanupを含め、次の契約を専用Preview deploymentのE2EとFunction Testで維持する。
発行・再送・preview・`linkAccount`・legacy `accept`・招待通知と管理者連携完了通知は、認証、所属、token、version、上限をサーバー側で確認する。
取消済み、期限切れ、再送前versionの招待は受諾できない。
Notification Outboxは外部送信直前にも招待、所属、受取人を再確認し、無効になった招待の投入済み通知をproviderへ送らず取消する。

- 招待はメールで送り、発行から7日間有効な一回限りのtokenを使う。
- `/manage/managers`と対応一覧からの発行・再送・取消は、`issueForOrganization`、`resendForOrganization`、`revokeForOrganization`を使う。  これらは店舗を受け取らず、指定組織のcanonical active管理者とBusiness writeをサーバーで再検証する。
- 招待対象の組織人物が未接続、またはまだ存在しない場合は、受取人の確認済みメールを正規化し、招待先メールとの完全一致を連携時に確認する。
- 招待対象の組織人物が既に`userId`へ接続済みなら、その利用者本人だけが承認でき、メール照合をアカウント同一性の代わりにしない。
- 招待対象の組織人物が未接続、またはまだ存在しない場合は、Node actionがClerk Backend APIから取得した確認済みメール一覧に招待先メールが含まれる場合だけ承認する。
- Clerk providerの設定不足、一時障害、照会失敗では`unavailable`を返し、招待のstatus、version、予約枠を変更せず再試行可能な状態を維持する。
- Node actionの準備処理と確定処理の間では、認証主体、招待ID、version、token digest、確認済みメールをproofで結び、確定時に招待状態と上限を再確認する。
- 発行時と連携時の両方で、管理者追加権限、人物上限、管理者上限、予約枠をサーバー側で確認する。
- 再送は旧招待を失効させ、tokenをローテーションする。
- 新規発行は、同じ対象の期限内招待を暗黙に再送しない。管理者設定の招待中一覧から明示的に再送し、以前の招待URLが使えなくなることを確認する。
- 生tokenをNotification Outboxへ保存せず、送信直前にサーバー側秘密値から導出する。
- 外部人物は招待発行時に人物や所属を作らず、アカウント連携が成功したtransaction内で初めて作る。
- Freeは、既存スタッフと外部人物のどちらにも通常の管理者追加招待（`purpose: "managerAddition"`）を発行できる。
  有効管理者と期限内の追加招待は合計2名までとし、外部人物の招待では利用人数の空きも確認する。
- 旧`freeManagerExchange`招待は新規発行と再送を行わない。
  既発行の期限内tokenだけは旧意味のまま承認または取消でき、承認時は後任の有効化と旧管理者の権限失効を同じtransactionで確定する。
  この招待が残る間は新しい追加招待を発行しない。
- Freeで有効管理者を2名から1名にする権限解除は許可し、1名から0名にする解除は拒否する。
- 期限切れ、取消、上限超過、メール不一致、所属不整合では管理者権限を作らない。
- `active`または`readOnly`の管理者人物は、スタッフ所属だけを個別店舗または全店舗から解除できる。
  組織から人物を削除する場合だけは、先に管理者権限を外す。

## 主要な課金状態

| 状態 | 利用者から見た意味 | 書込・復旧の扱い |
|---|---|---|
| `trial` | 無料体験中。Pro相当を利用する | 継続先としてStandardまたはProを選べる |
| `initialPaymentPending` | Trial終了時の初回支払い結果を確認中 | Standard相当を維持し、検証済み結果を待つ |
| `pendingActivation` | 既存FreeまたはStandardから有料プランを有効化中 | 保存したfallbackの権限を維持する。Free fallbackは5名、1店舗、管理者2名を使う |
| `active.free` | Freeを利用中 | 5名、1店舗、管理者2名に限定する。二つ目以降の組織はこの状態で開始する |
| `active.standard` | Standardを利用中 | 25名、5店舗、管理者5名を許可する |
| `active.pro` | Proを利用中 | 50名、5店舗、管理者5名を許可する |
| `complimentary.pro` | 支払い不要Pro相当を利用中 | Pro権限を許可し、Stripe処理を拒否する |
| `scheduledChange` | 期間末のプラン変更または解約を予約済み | 期間末までは現在の有料プランを維持する。解約予約は`restrictAtPeriodEnd: true`で識別する |
| `grace` | 最初に検証された支払い失敗から14日間の猶予中 | 現在の有料権限と復旧操作を維持する |
| `restricted` | 旧契約制限の互換shape | 現行writerは作成しない。課金互換readinessで全deploymentの0件を確認するまでschema・validator・readerだけで受け付ける |

状態遷移の前提、通知、期限、上限超過時の分岐は[業務要件](../specs/organization-billing-business-flow.md)を参照する。

有料プランの新しい終了操作は「Freeプランに変更」ではなく「解約」と表示する。
期間末までは現在の有料機能を利用でき、期間末前なら予約を取り消せる。
Stripeで期間末終了を確認した後は`active.free`へ移し、管理者、店舗、人物、スタッフ所属、シフトを変更しない。
Free上限を超えていれば、保存状態を増やさず整理操作だけを許可する。

`active.free`は追加組織と既存のFree組織へ適用する。  支払い不要Pro相当は既存の適用組織に加え、有効なプロモーションコードを入力した所属0件からの初回Setupへ適用する。
deployment前から保存済みで`targetPlan: "free"`かつ`restrictAtPeriodEnd`を持たない変更予約も、providerで期間末終了を確認した後は`active.free`へ収束させる。
`setFreeSelection`はrolling互換用に残す。Productionの対象データとMigration要否はrepositoryから推測せず、旧callerのdrainと対象deploymentの全ページreadinessで不在を確認した後に、旧shapeと同時にNarrowする。

## 画面

| 画面 | 役割 |
|---|---|
| `/dashboard?org=<organizationId>&shop=<shopId>` | 明示した組織とactive店舗を再検証し、現在店舗の業務と利用状況を表示する |
| `/manage?org=<organizationId>` | 現在の組織と店舗の概要と、組織作成、店舗追加、管理者、課金の入口を表示する |
| `/manage/organization?org=<organizationId>` | 現在の組織名と削除を扱う |
| `/manage/shops/<shopId>?org=<organizationId>` | 同じ組織の現在店舗の情報、所属、稼働状態を管理する |
| `/staff/<personId>?org=<organizationId>` | 組織人物、店舗所属、管理者状態を確認する |
| `/manage/managers*?org=<organizationId>` | 管理者一覧、招待、再送、取消、権限解除を扱う |
| `/manage/billing?org=<organizationId>` | 現在プラン、価格、契約変更、Portal、請求先メールを扱う |
| `/manager-invite?token=...` | 管理者招待のpreviewと受諾を扱う |

### Dashboardの組織・プラン表示

Dashboardは組織を親、現在の店舗を作業対象として順に表示する。
別組織の作成、組織切替、店舗追加は、管理者状態と契約状態に応じて表示する。

`getDashboardShop`が選択店舗と組織所属を検証して返す`planStatus`を、プラン表示の正本にする。
`planStatus`は`trial`、`initialPaymentPending`、`pendingActivation`、Free・Standard・Proの利用中、支払い不要Pro相当、変更予約、支払い猶予、旧契約制限を、利用者向けの最小DTOへ投影する。
Trialの契約操作ダイアログでは、保存された終了境界を排他的な課金開始日時として扱い、JSTでその前日を「無料体験の最終日」、境界日を「課金開始日」として表示する。
利用数DTOは課金状態と分け、現在値、未承認の管理者招待数、評価プラン、`withinLimits`、`overLimit`、`unknown`を返す。
別組織の課金state、StripeのCustomer・Subscription・Price ID、providerの生応答は返さない。

`/dashboard`は`shopId`に加えてURLから検証した`expectedOrganizationId`をDashboard queryへ渡す。
両者が一致しない場合は店舗情報を返さず、`readOnly`の組織所属または業務更新不可の課金状態では既存Dashboardを閲覧専用にする。
frontendの閲覧専用表示だけを認可根拠にせず、mutationも実行時の組織所属と課金policyを再検証する。

組織Accordionを開いている間だけ、`getDashboardPlanUsage`で組織全体の利用状況を購読する。
折りたたみ中はqueryを`"skip"`し、Dashboardの初期表示へ利用数の読み取りを追加しない。
画面では依頼に合わせて「スタッフ」と表示するが、値は課金上の`peopleUsage`であり、店舗をまたぐ同一人物を重複排除し、active管理者と期限内の予約枠を含む。
店舗数はactiveかつ未削除の店舗だけを数え、適用上限を確定できない状態では推測値を表示しない。

管理者数はserverのDTOに`managerUsage`があるとき3列目へ表示する。
frontendだけの状態やCSSを認可境界にしない。

Dashboardは現在のプランと利用状況を最小DTOから表示し、必要な課金Calloutと「プランと支払い」への導線を提供する。
料金と販売中プランの比較は`/manage/billing?org=<organizationId>`で扱い、CheckoutやPortalのActionは認証、組織境界、管理者状態、契約状態、Stripe設定をserver-sideで確認する。
表示する金額と`day`、`week`、`month`、`year`の請求周期はStripe Priceから取得し、開発用の短縮周期も同じ経路で表示する。
「プランと支払い」で表示する税区分はActionが明示した場合だけ表示し、不明な場合は税込・税抜を推測しない。

rolling deploy中は、`planStatus`が`undefined`の場合だけ、旧backendの応答として`trialEndingNotice`によるCalloutへfallbackする。
`planStatus`対応backendが`planStatus: null`を返した場合は「表示対象のプラン状態なし」という明示結果なので、旧Calloutへfallbackしない。
新旧frontendとbackendのdrainを確認した後、`trialEndingNotice`、旧Callout、`undefined`判定をNarrowで削除する。

この表示は既存の課金stateとSubscription snapshotを読み、保存形式を変更しないため、schema変更とmigrationを必要としない。
Productionでの公開状態は未確認であり、実装やローカルテストから公開済みと判定しない。
実環境の確認結果は[リリース状態](../manual/release-status.md)を正とする。

## コードの入口

### バックエンド

| パス | 責務 |
|---|---|
| `convex/setup/mutations.ts` | 所属0件の初回セットアップと、既存管理者による追加組織作成を受け付ける |
| `convex/setup/service.ts` | 組織、最初の管理者、店舗、初期課金状態を作る。初回Setupはコード空欄なら`trial`、有効なコードなら`complimentary.pro`、追加組織は`active.free`を使う |
| `convex/_lib/functions.ts` | 認証、組織所属、選択店舗、課金状態を検証するAPI wrapper |
| `convex/dashboard/queries.ts` | 選択店舗の認可境界で、Dashboard用の現在プランと対応状態を投影し、カード展開中だけ組織の利用状況を最小DTOで返す |
| `convex/organization/` | 組織、店舗、人物、管理者、利用状況、削除可否を扱う |
| `convex/organizationBilling/` | プラン上限、利用実数から導出するaccess policy、期限、解約、旧state移行、請求先メール、通知を扱う |
| `convex/organizationStripe/` | Stripe API、現在Subscriptionの保存済みPriceのread-only取得、Checkout、Portal、Webhook、再照合、probeを扱う |
| `convex/organizationInvitation/mutations.ts` | 管理者招待の発行、再送、取消、承認準備、proof付き確定、旧mutation互換を扱う |
| `convex/organizationInvitation/acceptanceActions.ts` / `convex/_lib/clerkVerifiedEmailProvider.ts` | 未接続人物のClerk確認済みメールをNode runtimeで照合し、provider失敗時は招待を消費せず返す |
| `convex/migrations/m023_organization_invitations_narrow_prep.ts` | 旧招待lifecycleと欠損fieldをNarrow前に補完する |
| `convex/migrations/m028_shop_billing_states_narrow_prep.ts` | 旧店舗課金rowを保持したままcanonical課金状態との対応異常を記録する |
| `convex/narrowReadiness/queries.ts` | 招待、請求先、Subscription、制限状態をPIIなしで全ページ確認する |
| `convex/notificationOutbox/` | 外部送信前の宛先・所属・課金状態再確認と重複排除を行う |
| `convex/migrations/m021_organization_billing_complimentary_pro_to_business.ts` | 旧`complimentary.pro`を変換した履歴migrationとMigration Testの契約 |
| `convex/migrations/m022_organization_billing_to_complimentary_business.ts` | 段階リリース時に、全課金状態を現在の表示でいう支払い不要Pro相当へ寄せた履歴migration |
| `scripts/verifyComplimentaryBusinessM021Export.ts` | Narrow deploy前にm021前後のexport証跡をfail-closedに検証する |

### フロントエンド

| パス | 責務 |
|---|---|
| `src/pages/app-manage/` | 現在組織と店舗の管理画面、組織作成、店舗追加、管理者、課金への導線 |
| `src/components/features/ManagerSettings/` | 管理者設定、既存スタッフ招待、新しい人物の招待に必要な画面状態 |
| `src/components/features/OrganizationSettings/` | 現在組織と店舗の共有設定UI、組織作成・店舗追加・課金UI |
| `src/components/features/OrganizationSettings/BillingSettings/` | 価格表示、プラン変更、Portal、請求先メールのcontrollerとdialog |
| `src/components/features/ManagerInvitationAcceptance/` | 招待preview、認証導線、連携結果 |
| `src/pages/account-security/` / `src/components/features/LoginMethods/` | シフト連絡先と独立したアカウント設定の画面境界、Clerk状態からの表示判定と操作可否 |
| `src/components/features/AuthenticatedApp/AuthGuard.tsx` | URLと利用可能店舗から有効な操作contextを解決する |
| `src/pages/dashboard/` | `/dashboard`の明示組織・店舗scope、Dashboard接続、Setup、Loading・Empty・readOnly・error状態を扱う |
| `src/components/features/Dashboard/` | 組織・店舗context、現在プラン、課金対応状態、閲覧専用状態を表示する |

## 主なAPI入口

すべてのpublic Convex functionは`args`と`returns` validatorを持つ。
次は代表的な入口であり、完全な関数一覧はコードを正とする。

| 入口 | 用途 |
|---|---|
| `api.setup.mutations.verifyPromotionCode` | 所属0件の初回登録対象者について、プロモーションコードを作成副作用なしで事前照合する。成功結果だけを返し、コード値は保存しない |
| `api.setup.mutations.setupShopAndManager` | 所属0件の初期設定と、1組織、1店舗、管理者本人を作成する。任意のプロモーションコードが空欄ならPro相当の3か月Trialとdeadline、有効なら期限なしの`complimentary.pro`を作り、どちらもStripe objectは作らない |
| `api.setup.mutations.createOrganization` | 既存管理者による追加組織作成。認証、作成上限、rate limit、冪等性を確認し`active.free`を作る |
| `api.dashboard.queries.getMyShops` | 利用可能な店舗、組織、所属状態の取得 |
| `api.dashboard.queries.getDashboardShop` | 選択店舗を認可し、Dashboard用の`planStatus`とrolling deploy用の旧`trialEndingNotice`を取得 |
| `api.dashboard.queries.getDashboardPlanUsage` | 選択店舗を認可し、明示された時刻を基準にスタッフ・店舗・管理者の現在値と上限を取得 |
| `api.organization.queries.getSettings` | 組織設定、利用状況、課金状態、操作可否の取得 |
| `api.organization.queries.getManagerSettingsOverview` | `{ shopId, now }`で選択店舗を認可し、管理者数、招待中件数、現在の管理者、期限内の招待、操作可否を`integrityError` / `ready` unionで取得 |
| `api.organization.queries.getManagerCandidates` | `{ shopId, now }`で選択店舗を認可し、既存スタッフの単一選択候補と選択不可理由を`integrityError` / `ready` unionで取得。候補サブページを開いた間だけ購読する |
| `api.organization.mutations.*` | 組織名、店舗、人物、管理者、削除の更新 |
| `api.organizationInvitation.queries.getPreview` | tokenのdigest、version、期限、取消状態を確認して招待previewを返す |
| `api.organizationInvitation.mutations.issue` | 組織管理者が人物上限、管理者上限、予約枠を確認して管理者招待を発行する |
| `api.organizationInvitation.mutations.createExternal` / `createForPerson` / `createForStaff` | rolling deploy中の旧client向けに、外部人物または既存人物へ管理者招待を発行する互換入口 |
| `api.organizationInvitation.mutations.resend` / `revoke` | 招待の再送と取消 |
| `api.organizationInvitation.acceptanceActions.accept` | 接続済み人物のアカウント一致、または未接続人物のClerk確認済みメールを検証して招待を承認 |
| `api.organizationBilling.mutations.setFreeSelection` | 旧Free予約と旧`restricted`だけを読み取れるrolling互換入口。Trialと新しい解約には使用せず、課金互換readiness完了後のNarrow対象にする |
| `api.organizationBilling.mutations.updateBillingEmail` | 認証、組織境界、管理者状態を確認して請求先メールを更新する |
| `api.organizationStripe.actions.getPlanPrice` / `startPaidCheckout` | Stripe設定と販売Priceを検証して価格を取得し、契約を開始する |
| `api.organizationStripe.actions.inspectPendingCheckoutForOrganization` / `cancelPendingCheckoutForOrganization` | `pendingActivation`に対応するCheckout Sessionの照合と、利用者が明示した未完了Checkoutの取消。URLやclient stateだけで課金状態を変更しない |
| `api.organizationStripe.actions.getCurrentSubscriptionPrice` | 選択店舗を認可し、現在の非terminal Subscriptionに保存したPriceから金額、通貨、周期、明示された税区分だけを取得 |
| `api.organizationStripe.actions.previewPaidPlanChange` / `changePaidPlanNow` | StandardからProへの日割りpreviewと即時変更 |
| `api.organizationStripe.actions.schedulePaidPlanChange` | ProからStandardへの期間末変更。`targetPlan: "free"`は受け付けない |
| `api.organizationStripe.actions.scheduleServiceStopAtPeriodEnd` / `cancelScheduledPlanChange` | 有料契約の期間末解約と、その予約取消 |
| `api.organizationStripe.actions.openCustomerPortal` | 支払い方法と請求履歴を扱う一時Portal URLの作成 |
| `api.organizationStripe.actions.cancelTrialContinuation` | Trial後の継続予約取消 |
| `POST /stripe/webhook` | 署名済みStripeイベントの受信 |
| `internal.organizationBilling.mutations.processDeadline` | Trial、猶予、期間末変更の期限処理 |
| `internal.organizationBilling.mutations.setStateFromVerifiedBilling` | 検証済みの課金結果を状態へ反映する唯一の接続点 |
| `internal.organizationStripe.actions.processWebhookEvent` | 受信済みWebhookの再取得、重複排除、状態反映 |
| `internal.organizationStripe.maintenance.getProbe` | Webhook、operation、対応関係、異常のbounded観測 |
| `internal.organizationStripe.maintenance.recoverWebhookEvents` / `recoverSafeOperations` | 再開可能なWebhookと安全operationのbounded回収 |
| `internal.migrations.index.runM021` | Widen期間にm021だけをdry runまたは限定再評価した履歴用runner |

`getProPrice`と`startProCheckout`は旧クライアント向け互換入口として残す。
`scheduleFreeAtPeriodEnd`は旧クライアントへ`not_allowed`を返し、新しいFree予約を作らない。
`cancelScheduledFree`はdeployment前からある予約を取り消す互換入口として残す。
`organizationInvitation.mutations.linkAccount`と`organizationInvitation.mutations.accept`もrolling deploy中の旧クライアント向け互換入口であり、新しい画面の標準承認経路にはしない。

## 検証の入口

- `convex/organizationBilling/*.test.ts`：プラン上限、利用実数からのaccess導出、Trial終了と解約後のFree移行、ProからStandardへの適用、旧shapeのread互換、期限、通知を検証する。
- `convex/dashboard/queries.test.ts`：選択店舗の認可境界、全課金状態の`planStatus`投影、利用状況の現在値・上限、不要な識別子の非露出を検証する。
- `convex/organizationStripe/*.test.ts`：新規販売用Price、現在Subscriptionの保存済みPrice、Checkout、期間末解約と取消、Webhook、再照合、支払い不要Pro相当のStripe隔離、probeを検証する。
- `convex/organizationInvitation/*.test.ts`：token、期限、接続済み人物のアカウント一致、未接続人物のClerk確認済みメール、provider失敗時の非消費、予約枠、再送、連携を検証する。
- `convex/organization/managerSettingsQueries.test.ts`：管理者設定のbounded read、currentとprojectedの分離、`integrityError` / `ready`、候補の選択不可理由を検証する。
- `convex/_scenario/organizationBillingLifecycle.test.ts`と`organizationPaidPlanChanges.test.ts`：時間と複数APIをまたぐ課金ライフサイクルを検証する。
- `convex/_scenario/staffManagerInvitation.test.ts`と`organizationManagerExchange.test.ts`：既存人物の通常招待と、既発行のFree管理者交代招待の互換処理を検証する。
- `convex/setup/mutations.test.ts`：初回Setupが所属0件だけに許可され、コード空欄ではPro相当の3か月Trialとdeadline、有効なコードでは期限なしの`complimentary.pro`を作ること、不正なコードでは副作用を残さないこと、いずれもStripe objectを作らないことと、追加組織が認証、上限、rate limitを再確認することを検証する。
- `convex/_scenario/organizationCreation.test.ts`：追加組織について、Free枠、冪等性、rate limit、初期Free状態、既存組織への非混入を検証する。
- `src/pages/dashboard/index.stories.tsx`、`src/components/features/Dashboard/DashboardContent/index.stories.tsx`、`src/components/features/OrganizationSettings/OrganizationCreation/OrganizationCreationDialog.stories.tsx`、`src/components/features/OrganizationSettings/controllers.test.tsx`：初回Setupと追加組織作成について、代表状態、フォーム操作、失敗後も同じ`requestId`を保つ再試行、mutation引数、作成後の遷移を検証する。
- `src/components/features/OrganizationSettings/PlanAndPaymentSection.stories.tsx`と`BillingSettings/`配下のStory・Logic Test：Free、Standard、Pro、未完了Checkoutの代表状態と主要変更操作を検証する。
- `src/components/features/Dashboard/PlanStatusCard/`のFrontend Unit・Story・Logic Test：折りたたみ中のquery停止、利用状況の局所Loading、全課金状態の表示変換、開閉、CTA、モバイル表示を検証する。
- `src/components/features/Dashboard/DashboardContent/index.stories.tsx`：`undefined`と`null`のfallback差、新旧表示の優先順位を検証する。
- `src/components/features/ManagerSettings/`のStoryとFrontend Unit Test：専用ページ、既存スタッフの単一選択、新しい人物の入力、Freeの2名上限、再送、取消、旧Free交代の互換表示、Loading、Empty、Error、閲覧専用の代表状態を検証する。
- `e2e/scenarios/organization-lifecycle.test.ts`：専用Preview deploymentで、2組織目の作成、改名、切り替えと、組織削除後の残存組織への復帰を検証する。
- `e2e/scenarios/manager-settings.test.ts`：同じE2E deploymentで`E2E-MANAGER-01`として、既存スタッフへの招待発行、再読込、取消、スタッフタブへの復帰を検証する。招待受諾は成功条件にしない。
- `e2e/scenarios/manager-lifecycle.test.ts`：同じE2E deploymentで`E2E-MANAGER-02`として、別のClerk actorによる招待受諾、管理者権限の取得と解除、解除後の管理画面へのアクセス拒否、スタッフ所属の維持を検証する。
- 管理者E2Eは招待capability、Clerk session、氏名、メールアドレスを扱うためtrace、screenshot、videoを無効にする。メールproviderへの実配送は成功条件にしない。

## 仕様・規約・運用

| 種別 | 正本・参照先 |
|---|---|
| 詳細な業務要件 | [組織課金の業務要件](../specs/organization-billing-business-flow.md) |
| セキュリティ | [セキュリティ戦略](../rules/security-strategy.md) |
| Convex設計 | [Convex設計戦略](../rules/convex-design-strategy.md) |
| テスト配置 | [テスト戦略](../rules/testing-strategy.md) |
| Stripe・migration・障害対応 | [組織課金の運用](../manual/organization-billing.md) |
| 実環境の確認結果 | [リリース状態](../manual/release-status.md) |
| リリース全般 | [CI/CD運用](../manual/ci-cd.md) |
| セキュリティcanary | [セキュリティ再検証](../manual/security-validation.md) |
| 削除契約 | [データ削除](data-deletion.md) |
| 意思決定と実装履歴 | [実装計画INDEX](../plans/INDEX.md) |

`doc/plans/`は意思決定と実装履歴であり、現在仕様や実環境状態の正本にはしない。
