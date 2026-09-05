# リリース状態

> 文書種別: 実環境状態
>
> 最終更新: 2026-09-05
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
| VRT・E2E用R2の認証・公開URL・削除権限 | CI接続確認済み・アプリProductionは対象外 | 2026-09-05 13:25 JST | R2 `yps-crispy-carnival`、GitHub Environment `Preview` | 本文のR2接続確認記録 |
| シフト表出力のローカルE2Eと通知抑止設定 | Local確認済み・Production未確認 | 2026-09-05 11:40 JST | `dev:fortunate-mallard-809` | 本文のシフト表出力のローカル確認記録 |
| 店舗status廃止のdeploy前export検証、m048 / m049完了、全ページpost-readiness、旧client drain | **Development PR1例外承認・runtime未反映・Production未確認** | 2026-08-29 10:15 JST | `dev:fortunate-mallard-809` | 削除済み`archived` 1件を変更せずPR1 runtime切替を進めるDevelopment限定の例外承認を得た。公開Function metadataは旧runtimeの140件で、`archiveShop` / `reactivateShop`が残る。m048、PR2、Productionとほかのdeploymentは未確認 |
| `staffs.organizationId` / `organizationPersonId` required Narrowと旧staff fallback削除 | **Development deploy停止・Production未確認** | 2026-08-29 10:23 JST | `dev:fortunate-mallard-809` | `verifyStaffs`全5ページ・497件で両ID欠損が各355件。欠損staffは未削除54店舗に分布し、未解消migration conflictも356件あるため、共有artifactの反映を停止した |
| `/dashboard`新shell反映前に`resolveOrganizationReadActor`と同じ一意性・active状態・相互リンク一致を満たす管理者所属と、legacyな`shopMembers`だけで利用できる管理者が0件であること | 未確認 | 未確認 | 未確認 | 未登録 |
| m022による既存組織の`complimentary.business`化と、対象集合・実行後exportの検証 | 未確認 | 未確認 | 未確認 | 未登録 |
| LINE共通化のProduction export判定、m041の実行要否と完了、全ページreadiness | 未確認 | 未確認 | 未確認 | 未登録 |
| LINE共通化の旧token・Outbox・scheduled callerのdrainと、常時canonical read artifactのProduction反映 | 未確認 | 未確認 | 未確認 | 未登録 |
| `/dashboard`と`/account`の新shell、旧route削除を含むartifactのProduction反映とcanary | 未確認 | 未確認 | 未確認 | 未登録 |
| 追加組織、店舗追加、管理者招待、課金を常時公開するartifactのProduction反映と、各導線・server capabilityのcanary | 未確認 | 未確認 | 未確認 | 未登録 |
| 新規Setupが1組織、1店舗、1管理者、2か月のTrialを作り、Trial期限処理を一度だけ予約し、Stripe Customer、Subscription、課金operationを作らないこと | 未確認 | 未確認 | 未確認 | 未登録 |
| 有効なプロモーションコードの事前照合と初回Setupが、期限なしの`complimentary.pro`を作り、Trial期限処理、Stripe Customer、Subscription、課金operationを作らないこと | **Repository一部実装・Production未確認** | 2026-08-26 | Repository | `verifyPromotionCode`は作成副作用なしで照合し、最終Setupで再照合する。直接呼出しに対するserver-side rate limitは未実装。`ENV-SETUP-02`の実環境canary、設定値、artifact反映は未確認 |
| 2か月Pro相当・カード登録不要の公開文言と、初回Setupが2か月のTrialを作るbackend・利用規約契約の一致 | **Repository整合・Production未確認** | 2026-08-27 | Repository | 新規SetupのTrial期限計算を2か月へ更新。保存shapeと保存済みの期限を変更しないためmigrationとbackfillは追加しない。Function / Scenario契約、管理ユーザー向け利用規約本文、文書版、同意要求版を更新。対象deploymentへの反映と実環境canaryは未確認 |
| StripeのStandard・Pro販売設定、Price、明示された税区分、Webhook、公開サイトBuild用にGitHub Environmentへ設定した`STRIPE_SECRET_KEY`、`STRIPE_STANDARD_PRICE_ID`、`STRIPE_PRO_PRICE_ID` | 未確認 | 未確認 | 未確認 | StandardとProは既存Priceの値を2キーへ移し、欠損、不正、重複時はfail closedにする。実値と切替完了は未確認 |
| 支払い猶予なしのFree移行、支払い失敗理由の画面表示、Stripe顧客向け支払い失敗メール | **Repository実装・実環境未確認** | 2026-08-29 | Repository | 14日猶予を削除し、対象3請求の検証済み未払いでは終了処理中からFree権限を適用する。Subscription終了、Invoice自動回収停止、`active.free`確定、支払い失敗理由の保持、Dashboardとプラン画面のAlertをFunction・Scenario・UIテストで確認。Stripe Dashboardの顧客メール設定、Customer.email同期、Sandbox canary、Production実到着は未確認 |
| plan ID Widen revisionのConvex / frontend反映と、Standard / Proの2キー契約 | **取下げ・実行不要** | 2026-08-29 | 要件判断 | プラン機能は未公開のため、旧プランIDとのrolling互換を行わない。設定不備時に副作用前停止する契約はcanonical実装へ残す |
| m042によるmarkerなしbilling stateのv2変換とreadiness | **取下げ・実行不要** | 2026-08-29 | 要件判断 | 保存済み課金データのmigrationとbackfillを行わない。m042を対象deploymentで実行しない |
| m043のAnalytics source event canonical化と`ANALYTICS_CALCULATION_VERSION=2` reset | **取下げ・実行不要** | 2026-08-29 | 要件判断 | 未公開プランID切替のためのmigrationとresetを対象deploymentで実行しない |
| m044のDashboard announcement canonical化、m045 / m046のStripe plan snapshot canonical化 | **取下げ・実行不要** | 2026-08-29 | 要件判断 | 未公開プランID切替のためのmigrationを対象deploymentで実行しない |
| m047の旧`shopBillingStates`物理cleanupと、markerなしplan IDのNarrow readiness | **取下げ・実行不要** | 2026-08-29 | 要件判断 | 未公開プランID切替のためのcleanupとreadinessを対象deploymentで実行しない |
| 旧契約制限状態、閲覧専用の管理者所属、復旧専用API・権限・通知・画面を削除したartifactのProduction反映 | **Repository実装・Production未確認** | 2026-08-27 | Repository | 現行artifactは有効な管理者所属と、実利用数から導出する上限整理だけを使う。Productionの保存データ、Convex deploy、画面反映は未確認 |
| m042〜m047の全post readiness | **取下げ・実行不要** | 2026-08-29 | 要件判断 | migrationと互換readinessは実行しない。canonical requestのprovider canaryは、変更後artifactの独立した公開確認として扱う |
| `/commercial-transactions`の事業者名、運営責任者、所在地、電話番号 | **要対応（Production設定・公開未確認）** | 2026-08-23 | Repository | release buildはProduction GitHub Environment Variablesから3項目を取得し、欠落時に失敗する。実値とProduction表示は未確認 |
| Resendの`email.delivered` Webhook | 未確認 | 未確認 | 未確認 | 未登録 |
| Clerk、Cloudflare、Stripeのセキュリティ設定とprovider canary | 未確認 | 未確認 | 未確認 | 未登録 |
| 全ページWeb計測のGTM container、GA4 property、Clarity、Production request | 未確認 | 未確認 | 未確認 | 未登録 |
| `ENV-CLERK-02`のログイン方法・シフト連絡先分離canary | 未確認 | 未確認 | 未確認 | 未登録 |
| `verifyStaffs.activeStaffPersonEmailMismatch`の全ページ合計0件 | Development確認済み・Production未確認 | 2026-08-04 09:18 JST | `dev:fortunate-mallard-809` | 本文のDevelopment確認記録 |

「未確認」は未実施を意味しません。
この文書に、対象と時刻を特定できる証跡がまだないことを表します。

`/commercial-transactions`は、Production GitHub Environment Variablesの`VITE_COMMERCIAL_TRANSACTIONS_NAME`、`VITE_COMMERCIAL_TRANSACTIONS_ADDRESS`、`VITE_COMMERCIAL_TRANSACTIONS_PHONE_NUMBER`を実在する情報へ設定するまでProductionへ公開しません。
Production buildは3項目が空なら失敗します。  設定後も、事業者名と運営責任者、番地まで含む所在地、電話番号の表示と連絡可能性を確認してから状態を更新します。  Standard・Proの月額料金、通貨、請求周期、税込・税別はProduction buildがStripeから取得するため、ProductionのConvex deploymentと同じ`STRIPE_SECRET_KEY`とPrice IDをGitHub Environmentへ設定し、契約画面との一致も確認します。

2か月Pro相当・カード登録不要の公開文言、初回Setupの2か月Trial、管理ユーザー向け利用規約の本文・文書版・同意要求版はrepository上で同じ契約へ更新済みです。  Trial状態の保存shapeと保存済みの期限は変えず、新規Setupの期限計算だけを更新するため、この変更にmigrationとbackfillは追加しません。  対象artifactとConvex revisionのProduction反映、利用規約の再同意、初回Setupの実環境canaryを確認するまでは、Productionで利用可能とは判定しません。  静的UI、LP、FAQ、metadataの検証成功だけでは、この停止条件を解除しません。

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

### 2026-09-05 14:15 JST：VRT基準画像のR2初期移行（CI）

| 項目 | 確認内容 |
|---|---|
| 状態・確認者 | develop/mainの基準画像を実R2へ移行済み。Codexによる自動検証。アプリのProductionは対象外 |
| 対象 | R2バケット`yps-crispy-carnival`。旧hostingのdevelop/mainだけを、GitHub上のrun出所・ancestor・全4capture成功を確認して移行 |
| develop | run `33731611634` attempt 1、基準画像776件、ZIP 57,769,672 bytes |
| main | run `33744411833` attempt 1、基準画像776件、ZIP 57,772,356 bytes |
| 検証 | 両branchとも公開URLから既存のbaseline取得helperで匿名取得し、SHA-256・CRC・画像件数と展開先を検証して776件の展開に成功 |
| 証跡 | [初期移行run 33945662104 attempt 2](https://github.com/yn1323/yps-crispy-carnival/actions/runs/33945662104/attempts/2)。attempt 1はR2のHTTP 502で失敗し、原因確認後の1回の再実行で成功 |
| 残る範囲 | PR #900の承認・merge後にdevelop/mainの通常pushによる更新とPR終了時の自動削除へ移行する。設定値は変更していない |

### 2026-09-05 13:25 JST：レポート用R2接続確認（CI）

| 項目 | 確認内容 |
|---|---|
| 状態・確認者 | CIから実R2への接続を確認済み。Codexによる自動検証。アプリのProductionは対象外 |
| 対象 | R2バケット`yps-crispy-carnival`と、その`r2.dev`公開URL。GitHub Environmentは`Preview`、設定はrepository scope |
| artifact | workflow head `7479ea761edaf94488a71191d01cdae9a8189183`、固定helper `7aff4a01f749873dbc6ed0bffd5946f01c4fcc36` |
| 実行・結果 | `Maintain hosted report retention`の`operation: check`が成功。確認用ファイルの保存、取得、一覧、ETag条件付き更新、公開GET、匿名PUT拒否、削除、削除後の公開404を確認 |
| 証跡 | [接続確認run 33944491792](https://github.com/yn1323/yps-crispy-carnival/actions/runs/33944491792) |
| 設定変更・残る範囲 | 登録済みのSecrets二つ・Variables三つを使用し、設定値は変更していない。確認用ファイルは削除済み。baseline移行とPRレポート公開の結果は、この接続確認とは別に検証する |

### 2026-09-05 11:40 JST：シフト表出力と通知抑止設定（Local）

| 項目 | 確認内容 |
|---|---|
| 状態・確認者 | Local確認済み・Production未確認。Codexによる自動検証 |
| 対象 | ローカル開発用 `dev:fortunate-mallard-809` と起動済みの `http://localhost:3000` |
| artifact | `369102c2e70998d8e8bdc561843120a85b224ef8` をbaseとする未コミットcheckout。deploymentへ反映済みのcommit SHAは未確認 |
| 環境設定 | `pnpm exec convex env set DEBUG_NOTIFICATION_DELIVERY_MODE dry-run --deployment fortunate-mallard-809` が成功。CLIの対象表示は `dev deployment fortunate-mallard-809`。同じ対象への `env get` で `dry-run` を再確認 |
| E2E | `e2e/scenarios/shift-export.test.ts` の `E2E-EXPORT-01` と `E2E-EXPORT-02` がdesktop Chromium、1 worker、retryなしで成功。01は保存した全休シフトから別タブを開き、PDFとExcelのダウンロード、再読み込み後の出力を確認。02は未ログインの直接アクセスがログインへ遷移することを確認 |
| 証跡 | 現タスクのConvex CLI成功結果、`env get` の結果、Playwrightの各契約のpassed結果。氏名・勤務情報を含むtrace・動画・スクリーンショットは保存しない設定 |
| 復旧・残る確認 | 最初のHTTP 500は既存Viteが200へ回復したため再起動せず再検証。通知抑止の事前検査は無効な設定値で停止したため、上記の `dry-run` 設定後に01を再実行した。新しいサーバーは起動していない。Production、実機での保存、物理印刷は未確認 |

E2Eは専用テスト利用者のデータを初期化し、管理者シナリオの終了時にその利用者のテストデータを片付けた。  
検証用の一時Playwright設定で `webServer` を無効にし、既存サーバーだけを使用した。通知抑止設定はローカル環境のみに適用した。

### 2026-08-29 05:57 JST：店舗ライフサイクルdeploy前export（Development）

- 状態: Development PR1例外承認・runtime未反映・Production未確認
- 確認者: Codex（読み取り専用）
- 環境: Development
- 完全修飾deployment名: `dev:fortunate-mallard-809`
- commit SHA: deploymentへ反映済みのSHAは未確認。local checkoutは`2e4041941548de2fcf347b03b990ca7a42760ede`をbaseとする未コミットworktree
- artifact: runtime artifactは未反映。Convex snapshot timestampは`1787950593768228579`
- 公開Function確認: 2026-08-29 10:15 JSTにFunction metadataを読み取り、Developmentは公開140件、旧`organization/mutations`の`archiveShop`と`reactivateShop`を公開中と確認した。local checkoutの静的棚卸しは133件である
- 実行または確認内容: file storageを含まないsnapshot exportを`verifyShopLifecycleReadinessExport`で全件検証し、追加のread-only集計で該当rowの削除状態と親組織の削除状態を確認
- CLIが表示した対象: `fortunate-mallard-809`
- 結果: 134店舗中`operatingStatus`保持134件、`archived` 1件、未知status 0件。旧archive/reactivate audit action、旧analytics change、全shop status deltaは0件。`archived`の1件は`isDeleted: true`で、親組織も`isDeleted: true`
- 要件判断: 2026-08-29 10:11 JSTに、保存済み`archived` 1件を変更せず、DevelopmentのPR1 runtime切替を進める例外承認を得た。この承認は`dev:fortunate-mallard-809`の削除済み店舗1件だけを対象とし、汎用readiness、m048、PR2、ほかのdeploymentの条件を緩和しない
- 証跡: Convex Dashboardのsnapshotと、download済みZIPのSHA-256 `98f5df1779de4e6cffd1ba4e67ae3826d29dd7421f30676848a5996c9bcbdf75`。PIIとrow IDは本文へ記録していない
- 停止位置・復旧先: DevelopmentのPR1 runtime gateだけを解除する。m048のdry run・本実行とPR2 Narrowは、保存済み`archived`が残るため停止を維持する。`archived`を`active`または`isDeleted`へ自動変換しない
- 次の確認条件: m048またはPR2の前に、保存済み`archived` 1件を別途判断し、snapshot exportで`archivedOperatingStatus: 0`を確認する。対象となるほかのDevelopment、Preview、Production deploymentも同じpreflightで確認する

### 2026-08-29 10:23 JST：staff canonical ID Narrow deploy前確認（Development）

- 状態: Development deploy停止・Production未確認
- 確認者: Codex（読み取り専用）
- 環境: Development
- 完全修飾deployment名: `dev:fortunate-mallard-809`
- commit SHA: deploymentへ反映済みのSHAは未確認。local checkoutは`2e4041941548de2fcf347b03b990ca7a42760ede`をbaseとする未コミットworktree
- artifact: 共有artifactは未反映。Convex snapshot timestampは`1787966523604968268`
- 実行または確認内容: `verifyStaffs`を100件単位で5ページ、`verifyOrganizationMigrationConflicts`を100件単位で4ページ全件走査した。file storageを含まないsnapshotで欠損staffを店舗別に集計した
- CLIが表示した対象: `fortunate-mallard-809`
- 結果: staff 497件中、`missingOrganizationId`と`missingOrganizationPersonId`は各355件、その他のstaff anomalyは0件。欠損staffは54店舗に分布し、対象店舗はすべて`isDeleted: false`。migration conflict 356件はすべて未解消である
- 追加診断: m011とm027は各469件を処理して`isDone: true`、`state: "success"`。m027後に作成された28 staffはcanonical ID欠損0件であり、欠損355件はすべてm027以前に作成されている。欠損staffごとに未解消のstaff conflict `email_name_mismatch`が1件あり、sourceも355件すべて異なる。migration未実行や現行writerの再流入ではなく、同一組織内のメール一致・氏名不一致を推測統合しなかった集合として扱う
- 証跡: 本節の件数集計とConvex Dashboardのsnapshot。店舗名、staff ID、氏名、メールアドレスは文書へ記録せず、download済みZIPは集計後に削除した
- 停止位置・復旧先: shared checkoutの`staffs.organizationId` / `organizationPersonId` required schemaをDevelopmentへ反映しない。旧migrationを推測実行せず、Widen、既存データ移行、Narrowの順序を再判断する
- 次の確認条件: 両ID欠損、関連する未解消staff migration conflict、dangling / mismatchを全ページ合計0件にしてから、同じartifactで再確認する

### 2026-08-29：staff・人物件数の参考確認（Production）

- 状態: ユーザーによるDashboard件数確認のみ。Production export、全ページreadiness、artifact一致は未確認
- 環境: Production
- 結果: `organizationPeople` 779件、`staffs` 791件とユーザーが確認した。12件差は人物と店舗staffが1対1ではないデータモデルだけから異常とは判定せず、Widen artifactの準備やm050 dry runへ進む停止条件にはしない
- 停止位置・復旧先: required Narrowの条件は緩和しない。`verifyStaffs`全anomaly 0、未解消staff conflict 0、tenant・user・lifecycle整合、人物数・利用人数の意図しない変化なしを、ProductionでPIIを出さずに別途確認する。件数差から同一人物を推測統合しない

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
