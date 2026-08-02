# グループ課金の運用

> 文書種別: manual
>
> コード照合基準: `b61100a680e80d154a74f576d03c53712846e062`
>
> 実環境の公開・設定・migration状況: [リリース状態](release-status.md)

この文書は、グループ課金に関する人の運用を扱う。
Stripe設定、日常probe、Narrow deploy前確認、販売停止、Price rotation、障害復旧を、実環境を推測せずに進めるための手順である。

利用者向けの機能とコードの入口は[グループ課金、複数店舗、複数管理者](../features/organization-billing.md)、詳細な業務契約は[グループ課金の業務仕様](../specs/organization-billing-business-flow.md)を参照する。

## 作業目的から探す

| 作業 | 参照する節 |
|---|---|
| 実環境での完了条件と作業前確認 | [完了の判定](#完了の判定)、[作業前の共通確認](#作業前の共通確認) |
| ダークローンチ機能の公開・停止 | [ダークローンチ公開フラグ](#ダークローンチ公開フラグ) |
| Stripeの環境変数、Price、Portal、Webhook設定 | [Stripeの設定](#stripeの設定) |
| Webhook、operation、対応不整合の日常確認 | [日常probe](#日常probe) |
| m021の履歴確認とNarrow deploy前ゲート | [m021の履歴とNarrow deploy前確認](#m021の履歴とnarrow-deploy前確認) |
| 新規販売の停止と支払い不要プランのP0 | [販売停止](#販売停止) |
| ProまたはBusinessのPrice切替 | [Price rotation](#price-rotation) |
| Webhookと安全operationの再開 | [Webhookとoperationの復旧](#webhookとoperationの復旧) |
| 作業証跡と引き継ぎ | [証跡と引き継ぎ](#証跡と引き継ぎ) |

## 完了の判定

リポジトリの実装、ローカルテスト、plan文書だけでは、Stripe設定、production公開、Convex deploy、migration完了を証明できない。
実環境の作業は、対象revision、完全修飾deployment名、provider mode、実行結果、証跡が[リリース状態](release-status.md)に揃った時点で確認済みとする。

次の三つを混同しない。

1. export検証は、保存データの対象集合と不変条件を確認する。
2. migration statusは、workerが対象deploymentで完走したことを確認する。
3. provider canaryは、Stripeの実設定とdeployed artifactの組み合わせを確認する。

一つが成功しても、残りの成功を意味しない。

## 作業前の共通確認

1. `git rev-parse HEAD`で対象commitを記録する。
2. Convex Dashboardで対象projectと完全修飾deployment名を確認する。
3. Stripe Dashboardで対象accountとSandboxまたはlive modeを確認する。
4. CLI実行時は、表示されたdeployment名が意図した対象と一致するか確認する。
5. secret、token、認証header、Webhook本文、個人情報をログや証跡へ残さない。
6. 変更前にprobeとprovider側の対象を確認し、停止条件と復旧先を決める。

`--deployment prod`のような短縮指定は使わない。
短縮指定は現在選択中のConvex projectに依存し、別projectのdeploymentを選ぶおそれがある。

## ダークローンチ公開フラグ

次の公開フラグは、値が完全に`enabled`である場合だけ対象機能を開く。
未設定、空文字、別の値は閉状態として扱う。

| 変数 | 開く対象 |
|---|---|
| `FEATURE_ORGANIZATION_CREATION` | 二つ目以降のグループ作成 |
| `FEATURE_SHOP_ADDITION` | 店舗追加と既存人物の複数店舗所属UI |
| `FEATURE_BILLING` | プランと支払いのUI |
| `FEATURE_MANAGER_INVITATION` | 管理者の追加、Free管理者交代、再送、preview、受諾、招待通知、管理者連携完了通知 |

公開または停止は、対象commitのdeploy後に完全修飾deployment名を確認して実施する。
値はコマンド行へ直接書かず、対象キーだけを指定して対話入力する。

```bash
pnpm exec convex env set --deployment <fully-qualified-deployment> FEATURE_MANAGER_INVITATION
```

管理者招待を開ける前に、追加とFree交代の両方について、発行、メールまたはLINE通知、preview、受諾、権限反映、再送、取消を対象環境で確認する。
閉じるときは、発行・再送・受諾だけでなく、招待通知と管理者連携完了通知が新しくOutboxへ積まれず、投入済みOutboxも外部providerを呼ばず取消されることを確認する。
E2Eは同じ`.env`の値を読み、閉状態では招待を前提とするシナリオを`test.skip`する。
店舗所属追加を前提とするE2Eも、`FEATURE_SHOP_ADDITION`が閉じている間は`test.skip`する。
公開FAQはフラグを購読しないため、管理者招待を開けるreleaseで追加・交代の操作手順を復元し、利用不可中の案内も公開状態へ戻す。

作業後は`env list --names-only`でキーの存在だけを確認し、対象deployment、commit、確認日時、結果を[リリース状態](release-status.md)へ記録する。
値そのものをログや証跡へ残さない。

## Stripeの設定

### サーバー環境変数

| 変数 | 用途 | 不備時の扱い |
|---|---|---|
| `ORGANIZATION_INVITATION_SIGNING_SECRET` | 管理者招待tokenのHMAC導出に使う32文字以上の秘密値 | 既配信tokenの失効手段には使わない。rotation時は未送信・再試行中の招待を確認し、再発行する |
| `STRIPE_SECRET_KEY` | Stripe APIへ接続するSecret key | `sk_test_`または`sk_live_`以外なら課金操作を開始しない |
| `STRIPE_WEBHOOK_SECRET` | `POST /stripe/webhook`の署名検証 | `whsec_`形式でなければWebhookを受理せず、利用者起点の課金操作も開始しない |
| `STRIPE_PRO_PRICE_ID` | Proの月額Price | 未設定または不正なら利用者起点の課金操作を開始しない |
| `STRIPE_BUSINESS_PRICE_ID` | Businessの月額Price | 未設定、不正、Proと同一ならBusiness操作だけを停止する |
| `STRIPE_PORTAL_CONFIGURATION_ID` | 支払い方法更新と請求履歴に限定したPortal設定 | 未設定または不正なら利用者起点の課金操作を開始しない |
| `APP_URL` | CheckoutとPortalの戻り先 | サーバー側で戻り先を構築できない場合は開始しない |

値はブラウザへ公開しない。
Stripe.jsをブラウザで直接使わないため、`VITE_STRIPE_PUBLISHABLE_KEY`は使わない。

招待は発行時にtokenのdigestを保存するため、secretを変更しても既に配信したtokenは失効しない。
一方、変更前に作成した招待を変更後のOutboxが初めて送信または再試行すると、現在のsecretで再導出したtokenと保存済みdigestが一致しない。
rotationを失効操作として使わず、変更前の未送信・再試行jobを確認し、未連携招待を新しいsecretで再発行する。

ローカルと開発用deploymentは、それぞれ専用のStripe Sandboxへ接続する。
production deploymentへSandboxの実値を流用しない。
実際にどの環境へ何が設定済みかは[リリース状態](release-status.md)で確認する。

ローカルまたは開発用deploymentで、現在のConvex設定が対象と一致する場合は、`.env`を複製せず次を使う。

```bash
pnpm convex:env:setup
```

このscriptは、`.env`にあるallowlist内のキーを、現在のConvex設定が選ぶdeploymentへ同期する。
deploymentを引数で固定できないため、Productionやほかのprojectを扱う手順には使わない。

対象deploymentを明示する場合は、変更するキーごとに次を実行し、値は引数へ書かず対話入力する。

```bash
pnpm exec convex env set --deployment <fully-qualified-deployment> <KEY>
```

実行後のキー確認では、値を表示ず名前だけを取得する。

```bash
pnpm exec convex env list --names-only \
  --deployment <fully-qualified-deployment>
```

### Product、Price、Portal

1. ProとBusinessに別々のrecurring Priceを用意する。
2. どちらも月次、`interval_count: 1`とし、BusinessとProの通貨を一致させる。
3. 対象modeとPriceの`livemode`が一致することを確認する。
4. Priceをactiveにし、対象IDを対応する環境変数へ設定する。
5. Customer Portalは支払い方法更新と請求履歴だけを許可する設定を使う。
6. `getPlanPrice`で、active、月次、通貨、金額をサーバーが取得できることを確認する。

アプリはPrice IDをクライアントから受け取らず、サーバー側allowlistから選ぶ。
金額はコードへ固定せず、Stripe Priceから取得する。

### Webhook destination

Webhook送信先は、各Convex deploymentの次のURLである。
Cloudflare PagesのURLはCheckoutとPortalの戻り先であり、Webhook送信先には使わない。

```text
https://<deployment>.convex.site/stripe/webhook
```

Webhook destinationには、次の13イベントだけを登録する。

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

登録後は[セキュリティ再検証](security-validation.md)の`ENV-STRIPE-01`と`ENV-STRIPE-02`に従い、対象revisionとprovider modeを固定したcanaryを行う。
canaryの成功を確認するまで販売可能と判定しない。

## 日常probe

完全修飾deployment名を指定して、read-onlyのinternal probeを実行する。

```bash
pnpm exec convex run --deployment <fully-qualified-deployment> \
  organizationStripe/maintenance:getProbe '{}'
```

probeは全件集計ではなく、項目ごとに`observedCount`と`hasMore`を返す。
`hasMore: true`は正常ではなく、bounded sampleだけでは全体を判定できないことを示す。

| 出力 | 確認すること |
|---|---|
| `webhookStatuses` | `received`、`processing`、`retrying`、`failed`の滞留数と最古時刻 |
| `oldestObservedUnprocessedWebhookReceivedAt` | 未処理Webhookの滞留時間 |
| `latestObservedProcessedWebhookAt` | 最後に処理できたWebhook時刻 |
| `operationStatuses` / `operationActionRequired` | operationの滞留、再試行、手動対応待ち |
| `safetyOperations.unfinishedCancelSubscription` | 取消未完了 |
| `safetyOperations.unfinishedStopInvoiceCollection` | Invoice回収停止未完了 |
| `safetyOperations.priceRotationBlocking` | Price切替中に残してはいけない契約作成operation |
| `safetyOperations.reconcileSubscriptionActionRequired` | provider再照合の手動対応待ち |
| `anomalies.complimentaryStripeMappingP0` | 支払い不要プランとStripe objectの対応。1件以上ならP0 |
| `anomalies.activePaidWithoutCurrentSubscription` | 有料状態なのに現在のSubscriptionがない対応不整合 |
| `anomalies.activeFreeWithCurrentSubscription` | Free状態なのに現在のSubscriptionがある対応不整合 |
| `anomalies.organizationsWithMultipleNonterminalSubscriptions` | 一グループに複数の非terminal Subscriptionがある不整合 |
| `anomalies.organizationsWithMultipleStripeCustomers` | 一グループに複数Customerがある不整合 |
| `anomalies.subscriptionsWithoutMatchingLocalCustomer` | SubscriptionとローカルCustomerの対応不整合 |
| `anomalies.stripeCustomersWithoutBillingState` | Customerに対応する課金状態の欠落 |
| `anomalies.unresolvedM018MigrationConflicts` | Business廃止時の履歴migrationで未解消のconflict |

いずれかの`observedCount`が0でも、対応する`hasMore`が`true`なら解消済みと判定しない。
probeだけでは、Stripe上のPriceのactive状態、Subscription ItemのPrice、最新Invoiceの状態、`auto_advance`停止を証明できない。
必要な項目はStripe APIの再取得結果とDashboardの対象objectを照合する。

`verifyLegacyBusinessStates`はm018の履歴確認専用である。
現行のBusinessやm021の履歴確認には使わない。

`anomalies.complimentaryProAwaitingM021`はNarrow後のmaintenance probeから削除されている。
probeにこの項目がないことはm021の完走や旧形式の残件0を証明しないため、Narrow deploy前はmigration statusとexportを別々に確認する。

## m021の履歴とNarrow deploy前確認

現行コードの保存契約は`complimentary.business`だけを許可する。
`complimentary.pro`はm021のMigration Testとこの運用履歴だけに残し、通常runtimeでは読み書きしない。

対象deploymentのm021 statusとexport検証状況は、[リリース状態](release-status.md)を正とする。
対象revisionがNarrow済みでも、両方の証跡が未確認なら実環境の移行完了とは判定しない。
完全修飾deployment名を固定したstatusとexport証跡が揃うまで、Narrow版をそのdeploymentへdeployしない。

### 対象と停止条件

`m021_organization_billing_complimentary_pro_to_business`は、Widen期間にStripeから隔離された旧`complimentary.pro`だけを`complimentary.business`へ変更するための履歴migrationである。
グループ欠落、課金状態重複、Stripe Customer、Subscription、全statusのoperation、Webhook、課金通知、先行監査のいずれかがあれば変更せずconflictへ残す。

未移行の旧形式が見つかった場合はNarrow版をdeployしない。
Widen版の対象revisionへ戻ってm021と検証を完了し、その証跡を固定してからNarrow deployへ進む。

事前検証で次のいずれかが起きたら、migrationを開始しない。

- 対象件数が0件である。
- 必須tableまたはmanifest dataがない。
- JSONLを解釈できない。
- Stripe証跡、先行監査、未解消m021 conflictがある。
- 対象deployment、commit、snapshot取得時刻を一意に記録できない。

### snapshot A、B、C

| snapshot | 取得時点 | 用途 |
|---|---|---|
| A | 対象releaseを始める前 | 障害調査と最終手段のrestore判断に使う。日常的なrollback手段にはしない |
| B | m021を含むreleaseの実行直前 | Go / No-Goのpre検証と対象集合の固定 |
| C | m021 statusの成功確認後 | post検証と移行後の証明 |

三つは別々のアクセス制限された一意なパスへ保存する。
各snapshotにdeployment名、commit SHA、取得時刻、ZIPのSHA-256、対象件数、対象set hash、verifier結果を対応付ける。

production snapshotには`pnpm convex:save`を使わない。
このコマンドは既存のbackup領域を掃除して固定パスへコピーするため、production証跡の分離に適さない。
Dashboard backupを優先し、CLIを使う場合は完全修飾deployment名と一意な保存先を指定する。

```bash
pnpm exec convex export --deployment <fully-qualified-deployment> \
  --path <access-controlled-unique-path>.zip
unzip -t <snapshot>.zip
shasum -a 256 <snapshot>.zip
```

snapshot取得後に対象データが変わった可能性があれば、そのsnapshotをGo判定に使わず再取得する。

### pre検証

snapshot Bへpre verifierを実行する。

```bash
pnpm convex:verify-complimentary-m021-export -- \
  --mode pre \
  --path <snapshot-b.zip>
```

成功したreportから`targetCount`と`targetSetSha256`を記録する。
この二つはpost検証へそのまま引き渡す。

### migrationの実行とstatus確認

`convex/migrations/index.ts`の固定seriesにはm021が登録されている。
developmentへのdeployは`.github/workflows/deploy.yml`、production releaseは`.github/workflows/release.yml`がConvex deploy後に`migrations/index:run`を実行する。

workflowで固定seriesを実行する場合、同じdeploymentへ手動の本実行を重ねない。
実際にworkflowが実行済みか、どのrevisionが対象かは[リリース状態](release-status.md)で確認する。

対象deploymentを完全指定し、m021が`isDone: true`、`state: "success"`、`error`なしになるまでstatusを確認する。

```bash
pnpm exec convex run --deployment <fully-qualified-deployment> \
  --component migrations lib:getStatus \
  '{"names":["migrations/m021_organization_billing_complimentary_pro_to_business:migration"]}' \
  --watch
```

CLIが表示したdeployment名が意図した対象と一致しなければ、その結果を採用しない。

### post検証

m021のstatus成功後にsnapshot Cを取得し、preの件数とhashを指定してpost verifierを実行する。

```bash
pnpm convex:verify-complimentary-m021-export -- \
  --mode post \
  --path <snapshot-c.zip> \
  --expected-target-count <pre-target-count> \
  --expected-target-set-sha256 <pre-target-set-sha256>
```

reportの`migrationStatus: "not_verified_by_export"`は意図した値である。
exportはworkerの完走を証明しないため、component statusとpost verifierの両方を証跡に残す。
全対象deploymentの完走、旧形式の残件0、未解消conflict 0を[リリース状態](release-status.md)で確認するまで、Narrow版をdeployしない。

### 失敗時の復旧

- productionでm021をresetしない。
- 課金証跡、監査、conflictを手動削除しない。
- 旧`complimentary.pro`や`complimentary.business`を手動patchしない。
- m021後にpre-Widen版へ戻さない。
- snapshot Aを即時restoreする前提にせず、影響とprovider状態を確認する。
- 修復が必要ならm022以降のforward migrationを作り、同じpre/status/postの証跡を設計する。

失敗中も、既存契約の署名済みWebhook、取消、請求停止、再照合を止めない。
支払い不要BusinessにStripe objectが対応した疑いがある場合は、次のP0手順へ進む。

## 販売停止

### 対象プランの新規販売を止める

1. 対象deployment、Stripe account、mode、ProまたはBusinessのPriceを特定する。
2. Stripe Dashboardで対象Priceをアーカイブする。
3. アーカイブ前に発行済みのopen Checkout Sessionを列挙し、すべて失効させる。
4. `STRIPE_SECRET_KEY`と`STRIPE_WEBHOOK_SECRET`は削除しない。
5. 署名済みWebhook、既存Subscriptionの取消、Invoice回収停止、provider再照合を継続する。
6. probeとStripe objectを照合し、停止時刻、対象Price、失効したSession、未解決項目を記録する。

Priceのアーカイブは新規販売を止めるが、既存Subscriptionを終了しない。
既存契約を一括で取消またはローカル状態から削除しない。

### 支払い不要プランのP0

`anomalies.complimentaryStripeMappingP0.observedCount`が1件以上なら、次の順で対応する。

1. 対象environmentのPro PriceとBusiness Priceをアーカイブする。
2. 発行済みのopen Checkout Sessionをすべて失効させる。
3. Webhook、取消、Invoice回収停止、再照合は継続する。
4. 対象グループ、Customer、全Subscription世代、Invoiceを照合する。
5. 誤請求の有無、返金、creditの要否を人が判断する。
6. 原因とforward repairを決め、providerとローカルの対応を再検証する。

`observedCount: 0`でも`hasMore: true`なら未確認である。
全件reconciliation、probe、provider canaryが揃うまで販売を再開しない。

## Price rotation

### 切替

1. 変更対象の旧Priceをアーカイブし、open Checkout Sessionをすべて失効させる。
2. probeの`safetyOperations.priceRotationBlocking`、取消、請求停止、`actionRequired`を確認する。
3. Stripeで新しい月額Priceを作る。
   BusinessではProと同じ通貨にする。
4. `STRIPE_PRO_PRICE_ID`または`STRIPE_BUSINESS_PRICE_ID`の対象側だけを新Priceへ変更する。
5. 現在のConvex設定が対象deploymentを指すことと、`.env`にある同期対象キーを確認する。
6. 対象キーだけを、完全修飾deployment名を指定した`convex env set`で更新する。続けて`env list --names-only`でキーの存在だけを確認する。
7. 新Priceの`livemode`、active、月次、通貨、金額を`getPlanPrice`とStripe Dashboardで確認する。
8. 対象modeでCheckout、Subscription、Webhook、Invoiceをcanary確認する。
9. 旧Priceを使う進行中のTrial・契約作成operationが0件までdrainしたことを確認する。
10. 既存Subscriptionが保存済みの旧Priceで継続していることを確認する。

新規operationは開始時のPrice snapshotを保持する。
既存Subscriptionは保存済みPrice IDで照合するため、ローカルSubscriptionのPrice IDを一括書換えしない。

### rollback

1. 新Priceをアーカイブする。
2. 新Priceで発行済みのopen Checkout Sessionをすべて失効させる。
3. 旧Priceを再有効化できる場合だけ、対象の環境変数を旧Price IDへ戻す。
4. 環境変数を同期し、probeとprovider canaryを再実行する。
5. 旧Priceを再有効化できない場合は、新Priceのまま原因を修復する。

どちらの場合も、安全確認前に販売を再開しない。

## Webhookとoperationの復旧

`convex/crons.ts`は、Webhook回収と安全operation回収を毎分実行する。
terminal recordの保持期限処理は日次で行う。

まずprobeで滞留と`actionRequired`を確認する。
cronが動作していない、または対象batchを明示的に再予約する必要がある場合だけ、完全修飾deployment名を指定してbounded recoveryを実行する。

```bash
pnpm exec convex run --deployment <fully-qualified-deployment> \
  organizationStripe/maintenance:recoverWebhookEvents '{}'

pnpm exec convex run --deployment <fully-qualified-deployment> \
  organizationStripe/maintenance:recoverSafeOperations '{}'
```

`recoverWebhookEvents`は、予約漏れ、期限切れlease、再試行時刻を過ぎたWebhookを再予約する。
`recoverSafeOperations`は、安定したidempotency keyで再開できる再照合、取消、請求停止、請求先メール同期、プラン変更だけを再予約する。
Checkoutや新規Subscription作成を推測で再送しない。

実行後は次を確認する。

1. 返却された`scheduledCount`、kind別件数、`reachedBatchLimit`を記録する。
2. 予約したbatchが処理されるのを待ってからprobeを再実行する。
3. `reachedBatchLimit: true`なら、先行batchの収束を確認してから次のbounded recoveryを判断する。
4. `actionRequired`は自動削除せず、Customer、Subscription、Invoice、operationの対応をprovider再取得で確認する。
5. 一意に対応できないobjectは推測で別グループへ結び付けず、手動対応またはforward repairへ残す。

復旧中もsecretとWebhookを単純に無効化しない。
provider側の請求停止や取消が未完了なら、新規販売を止めたまま安全operationを完了させる。

## 証跡と引き継ぎ

作業の結果は[リリース状態](release-status.md)の様式で記録する。
少なくとも次を含める。

- 確認日時、確認者、対象commit、artifact。
- 環境、完全修飾deployment名、Stripe accountの識別情報とmode。
- CLIが表示した実行対象。
- probe、migration status、export verifier、provider canaryの結果。
- snapshotまたはログのアクセス制限された保管先。
- 販売停止の対象、停止時刻、未解決のoperation。
- 復旧先と、販売再開または次工程へ進める条件。

秘密値、token、Webhook URL、Webhook本文、個人情報、実在するカード情報を記録しない。

## 参照先

- [グループ課金、複数店舗、複数管理者](../features/organization-billing.md)
- [グループ課金の業務仕様](../specs/organization-billing-business-flow.md)
- [リリース状態](release-status.md)
- [CI/CD運用](ci-cd.md)
- [セキュリティ再検証](security-validation.md)
- [セキュリティ戦略](../rules/security-strategy.md)
- [Convex設計戦略](../rules/convex-design-strategy.md)
- [テスト戦略](../rules/testing-strategy.md)
- `convex/organizationStripe/config.ts`
- `convex/organizationStripe/webhook.ts`
- `convex/organizationStripe/maintenance.ts`
- `convex/migrations/index.ts`
- `convex/migrations/m021_organization_billing_complimentary_pro_to_business.ts`
- `scripts/verifyComplimentaryBusinessM021Export.ts`
- `.github/workflows/deploy.yml`
- `.github/workflows/release.yml`
