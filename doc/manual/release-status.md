# リリース状態

> 文書種別: 実環境状態
>
> 最終更新: 2026-08-26
>
> 実環境確認: 未確認

この文書は、Productionの公開、deployment、migration、外部サービス設定を、実環境の証跡とともに記録する正本です。
リポジトリ内の実装、テスト成功、計画書の記述だけでは、実環境へ反映済みとは判定しません。

## 現在の確認状態

最終更新時点で、この文書へProductionを確認済みとするための実環境証跡は登録されていません。
RepositoryまたはDevelopmentの確認を明記した行を含め、Productionの状態はすべて**未確認**です。

現在のrepository artifactは、追加組織、複数店舗、複数管理者、支払いを機能ごとの環境変数なしで提供します。
このrepository上の方針から、Productionのartifact、migration、外部設定、既存データの状態を確認済みとは判定しません。

| 確認対象 | 状態 | 最終確認日時 | 対象環境・deployment | 証跡 |
|---|---|---|---|---|
| Productionのフロントエンドartifactとcommit SHA | 未確認 | 未確認 | 未確認 | 未登録 |
| ProductionのConvex deployとcommit SHA | 未確認 | 未確認 | 未確認 | 未登録 |
| Productionのmigration seriesと各migrationの完了 | 未確認 | 未確認 | 未確認 | 未登録 |
| `/dashboard`新shell反映前に`resolveOrganizationReadActor`と同じ一意性・active状態・相互リンク一致を満たす管理者所属と、legacyな`shopMembers`だけで利用できる管理者が0件であること | 未確認 | 未確認 | 未確認 | 未登録 |
| m022による既存組織の`complimentary.business`化と、対象集合・実行後exportの検証 | 未確認 | 未確認 | 未確認 | 未登録 |
| LINE共通化のProduction export判定、m041の実行要否と完了、全ページreadiness | 未確認 | 未確認 | 未確認 | 未登録 |
| LINE共通化の旧token・Outbox・scheduled callerのdrainと、常時canonical read artifactのProduction反映 | 未確認 | 未確認 | 未確認 | 未登録 |
| `/dashboard`と`/account`の新shell、旧route削除を含むartifactのProduction反映とcanary | 未確認 | 未確認 | 未確認 | 未登録 |
| 追加組織、店舗追加、管理者招待、課金を常時公開するartifactのProduction反映と、各導線・server capabilityのcanary | 未確認 | 未確認 | 未確認 | 未登録 |
| 新規Setupが1組織、1店舗、1管理者、3か月のTrialを作り、Trial期限処理を一度だけ予約し、Stripe Customer、Subscription、課金operationを作らないこと | 未確認 | 未確認 | 未確認 | 未登録 |
| 有効なプロモーションコードの事前照合と初回Setupが、期限なしの`complimentary.pro`を作り、Trial期限処理、Stripe Customer、Subscription、課金operationを作らないこと | **Repository一部実装・Production未確認** | 2026-08-26 | Repository | `verifyPromotionCode`は作成副作用なしで照合し、最終Setupで再照合する。直接呼出しに対するserver-side rate limitは未実装。`ENV-SETUP-02`の実環境canary、設定値、artifact反映は未確認 |
| 3か月Pro相当・カード登録不要の公開文言と、初回Setupが3か月のTrialを作るbackend・利用規約契約の一致 | **Repository整合・Production未確認** | 2026-08-24 | Repository | Trialの利用権限と上限をPro相当・50名へ更新。保存shapeを変更しないためmigrationは追加しない。Function / Scenario契約、管理ユーザー向け利用規約本文、文書版、同意要求版を更新。対象deploymentへの反映と実環境canaryは未確認 |
| StripeのStandard・Pro販売設定、Price、明示された税区分、Webhook、公開サイトBuild用にGitHub Environmentへ設定した`STRIPE_SECRET_KEY`、`STRIPE_STANDARD_PRICE_ID`、`STRIPE_PRO_PRICE_ID` | 未確認 | 未確認 | 未確認 | StandardとProは既存Priceの値を2キーへ移し、欠損、不正、重複時はfail closedにする。実値と切替完了は未確認 |
| plan ID Widen revisionのConvex / frontend反映と、Standard / Proの2キー契約、設定不備時に新規Checkout・料金取得・plan変更が副作用前に停止すること | 未確認 | 未確認 | 未確認 | 未登録 |
| m042によるmarkerなしbilling stateのv2変換と、billing row・scheduled job・課金通知の全ページreadiness | 未確認 | 未確認 | 未確認 | m042はmarkerなしの全課金状態を意味を維持してcanonical化する。Stripe rowの存在と同一組織の履歴行は停止条件にせず、dangling・scope固有の一意キー重複を停止し、plan snapshotはm045 / m046で変換する。pre / migration status / postの実環境証跡は未登録 |
| m043のAnalytics source event canonical化と`ANALYTICS_CALCULATION_VERSION=2` reset、materialized table・reset generationの全ページreadiness | 未確認 | 未確認 | 未確認 | migration status、reset generation、post readinessは未登録 |
| m044のDashboard announcement canonical化、m045 / m046のStripe plan snapshot canonical化 | 未確認 | 未確認 | 未確認 | Subscription / operationのpre、migration status、post readinessは未登録 |
| m047の旧`shopBillingStates`物理cleanupと、旧`restricted` / `readOnly` / markerなしplan IDのNarrow readiness | 未確認 | 未確認 | 未確認 | m028とcanonical対応を確認できないrowは削除しない。m047 status、旧店舗課金row 0、課金互換readiness blocking 0の実環境証跡は未登録 |
| m042〜m047の全post readinessとcanonical requestのprovider canary | 未確認 | 未確認 | 未確認 | 手順順はm042 → m043 → Analytics reset → m044 → m045 → m046 → m047 → 課金互換readiness → 全post readiness → provider canary。実環境証跡は未登録 |
| `/commercial-transactions`の事業者名、運営責任者、所在地、電話番号 | **要対応（Production設定・公開未確認）** | 2026-08-23 | Repository | release buildはProduction GitHub Environment Variablesから3項目を取得し、欠落時に失敗する。実値とProduction表示は未確認 |
| Resendの`email.delivered` Webhook | 未確認 | 未確認 | 未確認 | 未登録 |
| Clerk、Cloudflare、Stripeのセキュリティ設定とprovider canary | 未確認 | 未確認 | 未確認 | 未登録 |
| 公開Web計測のGTM container、GA4 property、Clarity、Consent、Production request | 未確認 | 未確認 | 未確認 | 未登録 |
| `ENV-CLERK-02`のログイン方法・シフト連絡先分離canary | 未確認 | 未確認 | 未確認 | 未登録 |
| `verifyStaffs.activeStaffPersonEmailMismatch`の全ページ合計0件 | Development確認済み・Production未確認 | 2026-08-04 09:18 JST | `dev:fortunate-mallard-809` | 本文のDevelopment確認記録 |

「未確認」は未実施を意味しません。
この文書に、対象と時刻を特定できる証跡がまだないことを表します。

`/commercial-transactions`は、Production GitHub Environment Variablesの`VITE_COMMERCIAL_TRANSACTIONS_NAME`、`VITE_COMMERCIAL_TRANSACTIONS_ADDRESS`、`VITE_COMMERCIAL_TRANSACTIONS_PHONE_NUMBER`を実在する情報へ設定するまでProductionへ公開しません。
Production buildは3項目が空なら失敗します。  設定後も、事業者名と運営責任者、番地まで含む所在地、電話番号の表示と連絡可能性を確認してから状態を更新します。  Standard・Proの月額料金、通貨、請求周期、税込・税別はProduction buildがStripeから取得するため、ProductionのConvex deploymentと同じ`STRIPE_SECRET_KEY`とPrice IDをGitHub Environmentへ設定し、契約画面との一致も確認します。

3か月Pro相当・カード登録不要の公開文言、初回Setupの3か月Trial、管理ユーザー向け利用規約の本文・文書版・同意要求版はrepository上で同じ契約へ更新済みです。  Trial状態の保存shapeは変えず、利用権限と上限をpolicyから導出するため、この変更にmigrationは追加しません。  対象artifactとConvex revisionのProduction反映、利用規約の再同意、初回Setupの実環境canaryを確認するまでは、Productionで利用可能とは判定しません。  静的UI、LP、FAQ、metadataの検証成功だけでは、この停止条件を解除しません。

## 記録に必要な情報

一つの確認記録に、次を揃えます。

- 確認日時とタイムゾーン。
- 確認者。
- 対象commit SHAと、デプロイしたartifactの識別子。
- Production、Develop、Previewなどの環境名。
- Convexでは完全修飾deployment名と、CLIが表示した実行対象。
- 実行したコマンドまたは外部管理画面で確認した項目。
- 成功、要対応、未確認の判定と、その根拠。
- アクセス制限されたログ、export、Pull Request、管理画面記録などの証跡。
- 失敗時の停止位置、復旧先、再確認条件。

秘密値、個人情報、token、Webhook URLは記録しません。

ログイン方法とシフト連絡先の分離を公開する前に、対象となる完全修飾Convex deploymentで`narrowReadiness/queries:verifyStaffs`を`isDone: true`まで全ページ実行し、`activeStaffPersonEmailMismatch`の合計が0件であることを記録します。  1件以上の場合は公開を停止し、連絡先を推測して修復せず、別のmigration判定へ分けます。

常時canonical readを含むartifactをProductionへ反映する前は、対象Production exportの`convex:verify-line-common-readiness`結果、`migrations/index:runLineCommonLinkBackfill`の実行またはskip根拠、LINE共通化readiness全ページ、旧非同期callerのdrainを別々に記録します。
artifactのProduction反映と反映後canaryも別の証跡とし、ローカルテストやrepository実装から完了を推測しません。

認証済みrouteをProductionへ反映する前は、対象artifactのSHA、`/dashboard`と`/account`のcanary、旧routeが互換redirectなしで404になることを別々に記録します。  組織作成、店舗追加、管理者招待、課金は同じartifactの通常経路として確認し、環境変数による公開状態とは分けません。
初回Setupの確認は新規作成documentだけを対象とし、既存データのmigration完了証跡には流用しません。

## 確認記録の様式

確認ごとに、次の節を複製して追記します。

```md
### YYYY-MM-DD HH:mm TZ：確認対象

- 状態: 確認済み | 要対応 | 未確認
- 確認者:
- 環境:
- 完全修飾deployment名:
- commit SHA:
- artifact:
- 実行または確認内容:
- CLIが表示した対象:
- 結果:
- 証跡:
- 停止位置・復旧先:
- 次の確認条件:
```

### 2026-08-04 09:18 JST：シフト連絡先projection（Development）

- 状態: Development確認済み・Production未確認
- 確認者: Codex（読み取り専用）
- 環境: Development
- 完全修飾deployment名: `dev:fortunate-mallard-809`
- commit SHA: `0a850a78998026cfc6cd65f7de2bb8b9b52451a8`をbaseとする未コミットworktree。Production artifactとの一致は未確認
- artifact: 未登録
- 実行または確認内容: `narrowReadiness/queries:verifyStaffs`を100件単位で5ページ、合計471件走査
- CLIが表示した対象: `fortunate-mallard-809`
- 結果: 最終ページで`isDone: true`。`activeStaffPersonEmailMismatch`の全ページ合計は0件
- 併記する既存anomaly: `missingOrganizationId`と`missingOrganizationPersonId`は各355件。その他の`verifyStaffs` anomalyは0件
- 証跡: 本節に集計した5回のConvex CLI出力。PIIとrow IDは出力されていない
- 停止位置・復旧先: Production公開判定、全体Narrow、schema変更には使用しない
- 次の確認条件: release対象と同じSHA・artifactの完全修飾deploymentで全ページ走査し、Production証跡を別途記録する

## Migrationの記録

exportの検証とmigrationの完了確認は別の証跡として残します。
snapshotの件数やhashが一致しても、migration workerの完走は証明できません。

Migrationを確認するときは、少なくとも次を分けて記録します。

1. 実行前snapshotの取得元、取得時刻、deployment、SHA-256。
2. dry runまたは事前検証の結果と停止条件。
3. migrationを実行した完全修飾deployment名と、CLIが表示した対象。
4. migration statusの完了結果。
5. 実行後snapshotと対象件数、整合性検証。
6. 失敗時のforward recoveryまたは復旧判断。

具体的な実行手順は[組織課金の運用](organization-billing.md)と、対象機能の運用文書を参照してください。
