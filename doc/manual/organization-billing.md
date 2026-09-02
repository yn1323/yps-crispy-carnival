# 組織課金の運用

> 文書種別: manual
>
> コード照合基準: 現在のcheckoutにある実装
>
> 実環境の公開・設定・migration状況: [リリース状態](release-status.md)

この文書は、組織課金に関する人の運用を扱う。
Stripe設定、日常probe、販売停止、Price rotation、障害復旧を、実環境を推測せずに進めるための手順である。

利用者向けの機能とコードの入口は[組織課金、複数店舗、複数管理者](../features/organization-billing.md)、詳細な業務要件は[組織課金の業務要件](../specs/organization-billing-business-flow.md)を参照する。

## 支払い失敗処理の実環境確認

検証済みの支払い失敗後は、Stripe契約の終了処理を開始すると同時にFree権限へ変更する。
リポジトリの実装だけではStripe設定、Convex deployment、顧客向けメールの有効化を証明できないため、対象environmentごとに次の項目を確認する。

プラン機能は未公開のため、旧プランIDのmigration、backfill、rolling互換は行わない。
m042〜m047、`planIdVersion`、旧`pro | business`互換の運用手順は本書から削除した。対象migrationを実行しない。

確認結果は[リリース状態](release-status.md)へ記録する。

1. Webhook destinationに`invoice.payment_failed`と`invoice.payment_action_required`が登録され、署名検証からworkerの処理まで対象revisionで到達することを確認する。
2. Stripe Dashboardのカード支払い失敗向け顧客メール設定を確認し、組織の請求通知先メールアドレスがStripe Customerの`email`へ同期されていることを確認する。
3. Stripe Sandboxで、検証済みの未払いから`paymentTerminationPending`へ移り、終了処理中からFree権限だけが適用されることを確認する。
4. Subscription終了とInvoiceの`auto_advance: false`が冪等に収束し、確認後に`active.free`と支払い失敗理由が保存されることを確認する。
5. 終了処理中を含め、ダッシュボードと「プランと支払い」にAlertが表示され、処理完了までは再契約できないことを確認する。
6. 新しい有料契約の支払い成功だけが支払い失敗理由を消し、旧Subscriptionの遅延eventで自動復帰しないことを確認する。

Stripe顧客向けメールの有効化画面と実到着は外部設定の証跡であり、リポジトリの実装やWebhook canaryの成功だけで確認済みとしない。

## 作業目的から探す

| 作業 | 参照する節 |
|---|---|
| 支払い失敗処理の実環境確認 | [支払い失敗処理の実環境確認](#支払い失敗処理の実環境確認) |
| 実環境での完了条件と作業前確認 | [完了の判定](#完了の判定)、[作業前の共通確認](#作業前の共通確認) |
| repository artifactとProduction反映の境界 | [公開状態](#公開状態) |
| Stripeの環境変数、Price、Portal、Webhook設定 | [Stripeの設定](#stripeの設定) |
| Trial期限を開発用に短縮 | [Trial期限の開発用設定](#trial期限の開発用設定) |
| 支払い失敗と下位プランへの移行 | [支払い失敗と下位active planへの移行](#支払い失敗と下位active-planへの移行) |
| Webhook、operation、対応不整合の日常確認 | [日常probe](#日常probe) |
| 新規販売の停止と支払い不要プランのP0 | [販売停止](#販売停止) |
| StandardまたはProのPrice切替 | [Price rotation](#price-rotation) |
| Webhookと安全operationの再開 | [Webhookとoperationの復旧](#webhookとoperationの復旧) |
| 作業証跡と引き継ぎ | [証跡と引き継ぎ](#証跡と引き継ぎ) |

## 完了の判定

リポジトリの実装、ローカルテスト、plan文書だけでは、Stripe設定、production公開、Convex deployを証明できない。
実環境の作業は、対象revision、完全修飾deployment名、provider mode、実行結果、証跡が[リリース状態](release-status.md)に揃った時点で確認済みとする。

次の二つを混同しない。

1. repository検証は、変更後artifactの契約と自動テストを確認する。
2. provider canaryは、Stripeの実設定とdeployed artifactの組み合わせを確認する。

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

## 公開状態

現在のrepository artifactは、複数組織、複数店舗、複数管理者、支払いを公開切替用の環境変数なしで提供する。  初回Setupは所属0件の本人だけが1組織、1店舗、1管理者を作成し、プロモーションコードが空欄なら2か月のTrial、server-only設定と照合できた場合は期限・料金なしの支払い不要Pro相当を適用する。  追加組織はFreeで開始する。

公開判断はFeature Flagではなく、対象artifactの反映とcanaryで行う。  操作可否は認証・所属、契約状態、プラン上限、Stripe設定、rate limit、冪等性をサーバー側で判定する。  Productionへの反映状況はrepositoryから推測せず、[リリース状態](release-status.md)で証跡がある項目だけを確認済みとする。

旧Feature Flagがdeploymentに残っていても現在のartifactは参照しない。  環境変数の整理を行う場合も、対象projectと完全修飾deployment名を確認し、値そのものをログや証跡へ残さない。

## Stripeの設定

### サーバー環境変数

| 変数 | 用途 | 不備時の扱い |
|---|---|---|
| `ORGANIZATION_INVITATION_SIGNING_SECRET` | 管理者招待tokenのHMAC導出に使う32文字以上の秘密値 | 既配信tokenの失効手段には使わない。rotation時は未送信・再試行中の招待を確認し、再発行する |
| `STRIPE_SECRET_KEY` | Stripe APIへ接続するSecret key | `sk_test_`または`sk_live_`以外なら課金操作を開始しない |
| `STRIPE_WEBHOOK_SECRET` | `POST /stripe/webhook`の署名検証 | `whsec_`形式でなければWebhookを受理せず、利用者起点の課金操作も開始しない |
| `STRIPE_STANDARD_PRICE_ID` | Standardのrecurring Priceを選ぶallowlist | 明示設定を必須とし、欠損、不正、Proと重複する場合は課金操作を開始しない |
| `STRIPE_PRO_PRICE_ID` | Proのrecurring Priceを選ぶallowlist | 明示設定を必須とし、欠損、不正、Standardと重複する場合は課金操作を開始しない |
| `STRIPE_PORTAL_CONFIGURATION_ID` | 支払い方法更新と請求履歴に限定したPortal設定 | 未設定または不正なら利用者起点の課金操作を開始しない |
| `APP_URL` | CheckoutとPortalの戻り先 | サーバー側で戻り先を構築できない場合は開始しない |
| `PROMOTION_COMPLIMENTARY_PRO_CODE` | 初回Setupで支払い不要Pro相当を適用する6桁英数字の照合値 | 未設定または不正でもコード空欄の通常登録はTrialで続ける。コードが入力された場合は支払い不要条件を適用せず、初回Setupを拒否する |

値はブラウザへ公開しない。
Stripe.jsをブラウザで直接使わないため、`VITE_STRIPE_PUBLISHABLE_KEY`は使わない。

### 公開サイトBuild環境変数

公開サイトは、ローカル、Preview、Develop、Productionの起動またはbuild時にStripeからStandard・Proの販売条件を取得し、公開可能な料金カタログだけを画面、SSG HTML、client bundleへ渡す。  ローカルとPreviewは同じStripe Sandboxを使い、Developは別のSandbox、Productionはliveを使う。

| 変数 | 用途 | 保管先と不備時の扱い |
|---|---|---|
| `STRIPE_SECRET_KEY` | 公開するPriceを取得するStripe Secret key | ローカルは`.env.local`を`.env`より優先して読む。Preview、Develop、Productionは対応するGitHub Environment Secretから読み、未設定または環境不一致なら起動・buildを失敗させる |
| `STRIPE_STANDARD_PRICE_ID` | 公開するStandardのrecurring Price | 対応するGitHub Environment Secretの明示値を必須とし、欠損、不正、Proと重複する場合は起動・buildを失敗させる |
| `STRIPE_PRO_PRICE_ID` | 公開するProのrecurring Price | 対応するGitHub Environment Secretの明示値を必須とし、欠損、不正、Standardと重複する場合は起動・buildを失敗させる |

ローカルで`.env.local`のSecret keyと`.env`のPrice IDを組み合わせる場合も、実際に選ばれるStandard・ProのPriceは必ず同じStripe Sandboxに属するものを使う。  別SandboxのPrice IDやactiveなPriceがない状態では、固定料金へ切り替えず起動・buildを失敗させる。

`STRIPE_SECRET_KEY`へ`VITE_`prefixを付けず、ローカルのVite設定と、同一repositoryのPull Requestだけに限定したPreview、Develop、Productionのbuild stepだけへ渡す。  Viteへ渡すのは金額、通貨、請求周期、税区分だけであり、credential、Price ID、Stripeのraw responseは公開artifactへ含めない。  Build後はclient HTMLとJavaScriptに環境変数名、`sk_test_`、`sk_live_`、Price IDが含まれないことを検査する。

`STRIPE_SECRET_KEY`をrotationした場合は、対象のConvex deployment、対応するGitHub Environment Secret、ローカルとPreviewの共通Sandboxであればローカル設定も同時に更新する。

Storybookとtestは決定的なfixtureを使い、Stripe credentialを受け取らない。  ローカルとPreviewは同じSandboxの販売条件を確認できるが、DevelopまたはProductionへの反映済み証跡には使わない。
Production buildは月1回のlicensed、per-unit Priceだけを受け付ける。  ローカル、Preview、DevelopはSandbox運用に合わせ、StandardとProで一致する日次または週次の検証用Priceも受け付ける。

招待は発行時にtokenのdigestを保存するため、secretを変更しても既に配信したtokenは失効しない。
一方、変更前に作成した招待を変更後のOutboxが初めて送信または再試行すると、現在のsecretで再導出したtokenと保存済みdigestが一致しない。
rotationを失効操作として使わず、変更前の未送信・再試行jobを確認し、未連携招待を新しいsecretで再発行する。

ローカルとPreviewは同じStripe Sandboxへ接続し、開発用deploymentは別のStripe Sandboxへ接続する。
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

実行後のキー確認では、値を表示せず名前だけを取得する。

```bash
pnpm exec convex env list --names-only \
  --deployment <fully-qualified-deployment>
```

### Price keyの設定とcanonical artifact確認

この切替は課金プランの公開前に行い、Preview、Develop、Productionを別作業として扱う。  対象deploymentとGitHub Environmentを固定し、切替完了まで課金プランを公開しない。  Price自体は作り直さず、変更前にStandardとして使っていたPrice値を`STRIPE_STANDARD_PRICE_ID`へ、Proとして使っていたPrice値を`STRIPE_PRO_PRICE_ID`へ移す。

1. 対象環境で課金プランが未公開であり、Checkoutやplan変更を開始できないことを確認する。
2. StandardとProに使っている既存PriceをStripe Dashboardで照合し、値をログへ出さず運用担当者の安全な入力経路へ引き継ぐ。
3. Convex deploymentと対応するGitHub Environment Secretへ`STRIPE_STANDARD_PRICE_ID`と`STRIPE_PRO_PRICE_ID`を設定する。  二つが明示され、異なるPrice IDであることを確認する。
4. 2キー契約のartifactをbuild・deployし、実行中revisionと公開料金のStandard / Pro対応を確認する。
5. canonical requestで料金取得、Checkout、plan変更のprovider canaryを行う。

値の移動はDashboardまたは対話入力で行い、command、log、運用記録へsecretやPrice IDの実値を書かない。  設定の欠損、不正、二つのPrice IDの重複時は、サーバーの課金操作と公開サイトBuildをfail closedにする。

### Product、Price、Portal

1. StandardとProに別々のrecurring Priceを用意する。
2. StandardとProの通貨、`recurring.interval`、`recurring.interval_count`を一致させる。  本番は月次、開発用Sandboxでは必要に応じて日次や週次を選べる。
3. 対象modeとPriceの`livemode`が一致することを確認する。
4. Priceをactiveにし、対象IDを対応する環境変数へ設定する。
5. Customer Portalは支払い方法更新と請求履歴だけを許可する設定を使う。
6. `getPlanPriceForOrganization`で、active、請求周期、通貨、金額をサーバーが取得できることを確認する。

アプリはPrice IDをクライアントから受け取らず、サーバー側allowlistから選ぶ。
金額と請求周期はコードや別の環境変数へ固定せず、Stripe Priceから取得する。
開発用に請求周期を短縮するときは、同じ周期のStandard PriceとPro PriceをStripe Sandboxで用意し、二つのPrice IDを切り替える。

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

## 支払い不要条件の適用コード

`PROMOTION_COMPLIMENTARY_PRO_CODE`は、所属0件からの初回Setupだけで支払い不要Pro相当を適用するserver-only環境変数である。  値は6桁の英数字とし、前後の空白を除いて大文字化した入力値と照合する。

プロモーションコードが空欄なら通常どおり2か月のTrialを作成する。  入力値が設定と一致した場合は、Trialに代えて期限・料金なしの`complimentary.pro`を作成する。  二つ目以降の追加組織はコードの対象外であり、Freeで開始する。

画面ではコード欄を初期表示で隠し、「プロモーションコードお持ちの方はこちら」から展開する。  「適用」の事前照合に成功すると読み取り専用で保持し、「変更する」で再編集、「入力をやめる」でコードを消してTrial経路へ戻す。  前のstepへ戻っても適用状態は保持する。

事前照合は組織や課金状態を作らず、成功結果を永続化しない。  成功表示後も最終Setupが現在の設定値と所属0件を再確認するため、設定値が途中で変更・削除された場合は作成せず、Trialへfallbackしない。

設定値はブラウザへ渡さず、入力値、設定値、照合結果の詳細をDB、audit、analytics、ログ、運用証跡へ残さない。  コードが入力されている状態で設定が未設定、不正、不一致の場合は、同じ利用者向けエラーで初回Setupを拒否する。

画面の試行回数ロックは、同じtabで10回失敗すると10分間「適用」を止めるUX制御である。  残り回数は表示せず、不一致、通信失敗、設定不備は同じ「コードが誤っています。」に統一する。  public mutationの直接呼出しでは回避できるため安全境界やrate limitとして扱わず、配布先を限定し、漏洩が疑われる場合は設定値を変更する。

設定値の変更または削除は、その後の初回Setupでの照合だけに影響する。  既に作成済みの`complimentary.pro`は維持され、設定値の変更や削除によってTrial、Free、有料プランへ移行しない。

ローカルまたは現在選択中の開発deploymentには、`scripts/setupEnv.ts`のallowlistを通じて同期できる。  `.env`を複製せず、同期先を確認してから次を使う。

```bash
pnpm convex:env:setup
```

Productionまたは別projectではこのscriptを使わず、Dashboardまたは完全修飾deployment名を指定したCLIで設定する。  値をcommand引数へ書かず、対話入力する。

```bash
pnpm exec convex env set --deployment <fully-qualified-deployment> PROMOTION_COMPLIMENTARY_PRO_CODE
```

無効化するときも対象deploymentを明示する。

```bash
pnpm exec convex env remove --deployment <fully-qualified-deployment> PROMOTION_COMPLIMENTARY_PRO_CODE
```

作業後は`env list --names-only`でキーの有無だけを確認し、値を表示しない。

## Trial期限の開発用設定

開発deploymentでは、所属0件からの初回Setupで`calculateTrialEndsAt`が決める期限を、次の環境変数で短縮できる。  二つ目以降の追加組織はFreeで開始するため、この設定の対象外である。

| 変数 | 用途 |
|---|---|
| `DEBUG_TRIAL_DURATION_DEPLOYMENT_URL` | 上書きを許可するConvex deploymentの`CONVEX_CLOUD_URL` |
| `DEBUG_TRIAL_DURATION_DAYS` | 登録日の何暦日後を期限にするか。`1`から`30`までの整数 |

両方のURLは前後の空白と末尾の`/`を除いて比較する。
URLが未設定または一致しない場合と、日数が未設定または空白の場合は、通常どおり2か月後のJST 00:00を期限にする。
対象URLが一致している状態で日数が不正な場合は、通常期間へ戻さず設定エラーにする。
`1`は登録から24時間後ではなく、登録日の翌日00:00 JSTを表す。
環境変数の変更は将来作成するTrialの計算にだけ反映し、保存済みの期限は更新しない。

Productionにはこの2変数を設定しない。
開発deploymentへ設定するときは、先に対象URL、次に日数を対話入力する。

```bash
pnpm exec convex env set --deployment <fully-qualified-deployment> DEBUG_TRIAL_DURATION_DEPLOYMENT_URL
pnpm exec convex env set --deployment <fully-qualified-deployment> DEBUG_TRIAL_DURATION_DAYS
```

無効化するときは、日数を先に削除してから対象URLを削除する。

```bash
pnpm exec convex env remove --deployment <fully-qualified-deployment> DEBUG_TRIAL_DURATION_DAYS
pnpm exec convex env remove --deployment <fully-qualified-deployment> DEBUG_TRIAL_DURATION_DEPLOYMENT_URL
```

この2変数は`scripts/setupEnv.ts`のallowlistへ含めない。
対象を引数で固定できない`pnpm convex:env:setup`では設定せず、Dashboardまたは完全修飾deployment名を指定したCLIを使う。
作業後は`env list --names-only`でキーの有無だけを確認し、値をログや証跡へ残さない。

## 支払い失敗と下位active planへの移行

未契約または継続予約取消済みのTrialが終了した場合は、管理者、店舗、人物、スタッフ所属、シフトを維持したまま`active.free`へ移行する。
有料契約の解約は期間末に適用し、Stripe上の契約終了を確認した後に`active.free`へ移行する。
ProからStandardへの期間末変更は、Stripe上のphase移行と支払い成功を確認した後に`active.standard`へ移行する。

StandardからProへの即時変更はStripeの`pending_if_incomplete`を使う。  未払いの間はHosted Invoice URLから支払いを再開でき、利用者が取り消した場合または日割り支払いに失敗した場合は、その変更で作られたInvoiceだけを安定したidempotency keyで`void`する。  Subscriptionを再取得し、`pending_update`が消えてStandardのPriceが維持されていることを確認してから`active.standard`へ戻す。

Trial終了時の初回請求、Standard / Proの通常更新、ProからStandardへの変更適用時の初回請求について検証済みの未払いを確認した場合は、`paymentTerminationPending`へ移行する。
これは利用者向けのプランではなく、Subscription終了とInvoiceの自動回収停止を追跡する内部workflowである。
開始時点からFreeの利用権限を適用し、支払い処理の再試行中も有料機能を許可しない。

内部workerは同じidempotency keyでSubscriptionを終了し、対象となるopenまたはdraft Invoiceの`auto_advance: false`を確認する。
Stripe側の停止を確認した後に、`active.free`と支払い失敗理由を同じ処理で保存する。
途中で失敗した場合はFree権限のまま再試行し、上限到達時は`actionRequired`として運用確認へ送る。
処理完了まで新しい有料契約を開始させない。

`auto_advance: false`は自動再請求、Reminder、Stripe Billingによる自動処理を止めるための完了条件である。
支払い失敗で有料契約全体を終了する本手順では、未払いInvoiceを`void`または`uncollectible`へ自動変更せず、別途確定した会計方針に従う。  StandardからProへの未完了変更だけは、変更を取り消してStandardを維持するため、当該日割りInvoiceを`void`する。
旧Invoiceが後から支払い済みになっても自動復帰せず、運用上の要対応として扱う。

上限状態は、未承認の管理者招待を除く実際の利用人数、未削除店舗数、有効管理者数と、現在適用中のFree / Standard / Proから導出する。
上限超過と利用上限評価不能は課金状態として保存しない。
利用実数が上限内へ戻ると、課金状態や上限フラグの更新なしで通常利用へ戻る。

旧プランIDのmigration、backfill、rolling互換は行わない。
対象environmentではcanonicalな変更後artifactとStripe Sandbox canaryだけを確認する。

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
| `anomalies.organizationsWithMultipleNonterminalSubscriptions` | 一組織に複数の非terminal Subscriptionがある不整合 |
| `anomalies.organizationsWithMultipleStripeCustomers` | 一組織に複数Customerがある不整合 |
| `anomalies.subscriptionsWithoutMatchingLocalCustomer` | SubscriptionとローカルCustomerの対応不整合 |
| `anomalies.stripeCustomersWithoutBillingState` | Customerに対応する課金状態の欠落 |

いずれかの`observedCount`が0でも、対応する`hasMore`が`true`なら解消済みと判定しない。
probeだけでは、Stripe上のPriceのactive状態、Subscription ItemのPrice、最新Invoiceの状態、`auto_advance`停止を証明できない。
必要な項目はStripe APIの再取得結果とDashboardの対象objectを照合する。

`anomalies.complimentaryProAwaitingM021`は現在のmaintenance probeから削除されている。

## 販売停止

### 対象プランの新規販売を止める

1. 対象deployment、Stripe account、mode、StandardまたはProのPriceを特定する。
2. Stripe Dashboardで対象Priceをアーカイブする。
3. アーカイブ前に発行済みのopen Checkout Sessionを列挙し、すべて失効させる。
4. `STRIPE_SECRET_KEY`と`STRIPE_WEBHOOK_SECRET`は削除しない。
5. 署名済みWebhook、既存Subscriptionの取消、Invoice回収停止、provider再照合を継続する。
6. probeとStripe objectを照合し、停止時刻、対象Price、失効したSession、未解決項目を記録する。

Priceのアーカイブは新規販売を止めるが、既存Subscriptionを終了しない。
既存契約を一括で取消またはローカル状態から削除しない。

### 支払い不要プランのP0

`anomalies.complimentaryStripeMappingP0.observedCount`が1件以上なら、次の順で対応する。

1. 対象environmentのStandard PriceとPro Priceをアーカイブする。
2. 発行済みのopen Checkout Sessionをすべて失効させる。
3. Webhook、取消、Invoice回収停止、再照合は継続する。
4. 対象組織、Customer、全Subscription世代、Invoiceを照合する。
5. 誤請求の有無、返金、creditの要否を人が判断する。
6. 原因とforward repairを決め、providerとローカルの対応を再検証する。

`observedCount: 0`でも`hasMore: true`なら未確認である。
全件reconciliation、probe、provider canaryが揃うまで販売を再開しない。

## Price rotation

### 切替

1. 変更対象の旧Priceをアーカイブし、open Checkout Sessionをすべて失効させる。
2. probeの`safetyOperations.priceRotationBlocking`、取消、請求停止、`actionRequired`を確認する。
3. Stripeで新しいrecurring Priceを作る。
   ProではStandardと同じ通貨、`recurring.interval`、`recurring.interval_count`にする。
4. 新Priceの`livemode`、active、licensed、per-unit、請求周期、通貨、金額、税区分をStripe Dashboardで確認する。
5. 対応するGitHub Environment SecretのPrice IDを新Priceへ変更する。値をworkflow、log、文書へ書かない。
6. 対象environmentで公開サイトをbuild・deployし、特定商取引法ページの金額、通貨、請求周期、税区分を確認する。ここまでは旧Priceをアーカイブしたままにし、新規販売を再開しない。
7. 現在のConvex設定が対象deploymentを指すことと、`.env`にある同期対象キーを確認する。
8. `STRIPE_STANDARD_PRICE_ID`または`STRIPE_PRO_PRICE_ID`の対象キーだけを、完全修飾deployment名を指定した`convex env set`で新Priceへ更新する。続けて`env list --names-only`でキーの存在だけを確認する。この切替後に新規販売を再開する。
9. 新Priceの`livemode`、active、請求周期、通貨、金額を`getPlanPriceForOrganization`とStripe Dashboardで照合する。
10. 対象modeでCheckout、Subscription、Webhook、Invoiceをcanary確認する。
11. 旧Priceを使う進行中のTrial・契約作成operationが0件までdrainしたことを確認する。
12. 既存Subscriptionが保存済みの旧Priceで継続していることを確認する。

新規operationは開始時のPrice snapshotを保持する。
既存Subscriptionは保存済みPrice IDで照合するため、ローカルSubscriptionのPrice IDを一括書換えしない。
請求周期を変更するrotationではStandardとProの両Priceを同じ周期で用意し、二つのPrice IDを一つの作業として切り替える。  周期が一致しない間はProの価格表示、Checkout、StandardとPro間の変更を再開しない。

### rollback

1. 新Priceをアーカイブする。
2. 新Priceで発行済みのopen Checkout Sessionをすべて失効させる。
3. 旧Priceを再有効化できる場合だけ再有効化し、GitHub Environment Secretの対象Price IDを旧Priceへ戻す。
4. 公開サイトを再build・deployし、特定商取引法ページが旧Priceへ戻ったことを確認する。ここまでは新規販売を停止したままにする。
5. Convex deploymentの対象Price IDを旧Priceへ戻し、probeとprovider canaryを再実行してから販売を再開する。
6. 旧Priceを再有効化できない場合は、新Priceのまま原因を修復する。

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
5. 一意に対応できないobjectは推測で別組織へ結び付けず、手動対応またはforward repairへ残す。

復旧中もsecretとWebhookを単純に無効化しない。
provider側の請求停止や取消が未完了なら、新規販売を止めたまま安全operationを完了させる。

## 証跡と引き継ぎ

作業の結果は[リリース状態](release-status.md)の様式で記録する。
少なくとも次を含める。

- 確認日時、確認者、対象commit、artifact。
- 環境、完全修飾deployment名、Stripe accountの識別情報とmode。
- CLIが表示した実行対象。
- probeとprovider canaryの結果。
- snapshotまたはログのアクセス制限された保管先。
- 販売停止の対象、停止時刻、未解決のoperation。
- 復旧先と、販売再開または次工程へ進める条件。

秘密値、token、Webhook URL、Webhook本文、個人情報、実在するカード情報を記録しない。

## 参照先

- [組織課金、複数店舗、複数管理者](../features/organization-billing.md)
- [組織課金の業務要件](../specs/organization-billing-business-flow.md)
- [リリース状態](release-status.md)
- [CI/CD運用](ci-cd.md)
- [セキュリティ再検証](security-validation.md)
- [セキュリティ戦略](../rules/security-strategy.md)
- [Convex設計戦略](../rules/convex-design-strategy.md)
- [テスト戦略](../rules/testing-strategy.md)
- [Stripe: Subscriptionの解約](https://docs.stripe.com/billing/subscriptions/cancel)
- [Stripe: Invoiceの自動回収停止](https://docs.stripe.com/api/invoices/update)
- `convex/organizationStripe/config.ts`
- `convex/organizationStripe/webhook.ts`
- `convex/organizationStripe/maintenance.ts`
- `.github/workflows/deploy.yml`
- `.github/workflows/release.yml`
