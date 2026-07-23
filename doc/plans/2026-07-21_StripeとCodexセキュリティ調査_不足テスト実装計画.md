# StripeとCodexセキュリティ調査 不足テスト実装計画

- 作成日: 2026-07-21
- 対象: Stripeの日本向けセキュリティ要件、2026-07-18のCodex Security調査、2026-07-21時点の現行worktree
- ステータス: リポジトリ実装・自動検証完了（実環境証跡は別途）
- 基準計画: `doc/plans/2026-07-20_Stripeセキュリティ対策_テスト計画.md`
- 再検証台帳: `doc/archive/audits/2026/security-validation-2026-07-21.md`

## 1. 結論

既存のStripe計画は、Stripeの六項目を自動テスト、Provider canary、環境設定、運用証跡へ分ける基準文書として維持する。

本計画は、その基準文書へCodex Security調査の30候補と現行コードの再確認結果を加えた差分計画である。

実装順は次のとおりとする。

1. 唯一正式検証済みのrelease artifact不一致を解消し、同じimmutable SHAをcanary、build、deployへ束縛する。
2. staff sessionの権限混同、magic link昇格、open redirectを、実際の攻撃入力を使う回帰テストで先に固定する。
3. 招待、登録、LINE連携の推測耐性、回数制限、単一有効token、replay耐性をFunction Testで固定する。
4. 通知の送信直前認可、lease回収、fanout再開、retention、error redactionをFunction TestとScenario Testで固定する。
5. PR workflowのcredential境界、内部BIの外部アクセス制御、Stripe sandbox、Clerk、Cloudflare、端末保護をコード外の証跡で確認する。

Codex Security調査の30候補を、30件の確定した脆弱性として扱ってはならない。

添付の`validation_report.md`で正式に`reportable`と判定されているのは`CAND-FR023-002`だけである。

残り29件は、現行コードとの突合結果を添えても、正式検証、product policy、実環境設定、severityの判断が残る候補として管理する。

## 2. 目的

本計画の目的は、セキュリティ上の主張を、失敗時に検知できる具体的なテストまたは証跡へ変換することである。

コードだけでは確認できないMFA、アカウントロック、Cloudflare Access、Radar、3DS、ウイルス対策を、無理にunit testの完了へ読み替えない。

既存テストの名前だけで保証済みと判断せず、攻撃者が実際に渡せるsession、token、request、時刻、provider応答をfixtureへ含める。

## 3. 調査資料と証拠の扱い

### 3.1 Codex Security資料

次の資料を入力とした。

- `G:/マイドライブ/80_環境変数/yps-crispy-carnival/secutiry/2026-07-18/repository_coverage_ledger.md`
- `G:/マイドライブ/80_環境変数/yps-crispy-carnival/secutiry/2026-07-18/finding_discovery_report.md`
- `G:/マイドライブ/80_環境変数/yps-crispy-carnival/secutiry/2026-07-18/dedupe_report.md`
- `G:/マイドライブ/80_環境変数/yps-crispy-carnival/secutiry/2026-07-18/validation_report.md`
- `G:/マイドライブ/80_環境変数/yps-crispy-carnival/secutiry/2026-07-18/README.md`

調査対象snapshotは`codex-security-snapshot/v1:sha256:2a5473a45f43f70d2746e6aa5309415d7201fa54d697d163ff69362d921c090e`である。

discoveryでは127ファイルの読取が完了し、重複排除後も30候補が残っている。

`repository_coverage_ledger.md`の`reportable`はdiscovery終了時の分類であり、正式検証後の最終判定ではない。

`README.md`には`CAND-FR009-001`の外部PoCがあるが、リポジトリ内の固定回帰にはなっていない。

### 3.2 現行コードとの時間差

添付資料のsnapshotと2026-07-21のworktreeは一致しない。

本計画の「現行」は、ユーザーの未コミット変更を含む2026-07-21のworktreeを読み取った結果である。

実装開始時には対象ファイルを再確認し、すでに修正された項目を二重実装しない。

### 3.3 判定ラベル

| ラベル | 意味 |
|---|---|
| 正式検証済み | 添付のformal validationでreportableと判定済み |
| 現行成立条件あり | 現行コードに候補の成立条件が残るが、正式なseverityとproduct policyは未確定 |
| 環境確認待ち | リポジトリ外の設定次第で抑制または成立する |
| 修正済み、回帰あり | 現行実装と既存テストが候補の再発を直接検知する |
| 修正済み、回帰不足 | 現行実装は根因を避けるが、再発検知テストがない |

## 4. Security Lens

| 観点 | 本計画で確認する内容 |
|---|---|
| Actor | 未認証者、manager、staff、submit session、view session、GitHub PR作成者、CI publisher、provider webhook、worker |
| Asset | manager画面、staffの確定シフト、招待とmagic link、LINE紐付け、通知宛先、Stripe課金状態、CI credential、顧客情報 |
| Trust boundary | Clerk identity、organizationとshop、Capability種別、公開HTTP、provider署名、Cloudflare Access、GitHub event、canary承認SHA |
| Abuse case | 権限昇格、IDOR、identity enumeration、token state枯渇、replay、通知濫用、stale recipient送信、credential持ち出し、未承認artifactのrelease |
| Server-side check | endpoint固有のaccessKind、token用途、tenant、current recipient、event identity、immutable SHA、provider objectの所有関係 |
| Rate limit | 攻撃者が選べないstable key、短時間上限、長期間上限、拒否時の永続化と外部副作用0件 |
| Lifecycle | 単一有効token、期限、失効、lease fencing、stale worker拒否、fanout resume、terminal payload redaction |
| LogsとPII | email、token、capability URL、provider body、decline情報、credentialをclient、console、DB、artifactへ残さない |
| Regression | 単一API境界はFunction Test、複数段階の収束はScenario Test、workflowは静的契約とruntime attestation、外部設定はcanaryと証跡 |

## 5. テスト実装の共通方針

### 5.1 テスト層

| 層 | 使う条件 | 主な対象 |
|---|---|---|
| Logic Test | 純粋関数と正規化の境界 | redirect、safe error、workflow policy helper |
| Convex Function Test | 単一query、mutation、action、HTTP Actionの境界 | 認証、認可、入力、rate limit、replay、provider非呼出 |
| Convex Scenario Test | 複数step、時刻経過、scheduler、workflowの回復 | lease回収、fanout再開、retention、exact-once収束 |
| Workflow静的検査 | YAML上のtrigger、checkout ref、secret境界 | GitHub ActionsのPR、release、publisher分離 |
| E2E | 実ブラウザと実認証を通さないと確認できない境界 | 未認証route、Clerkの実ログイン境界 |
| Deployed canary | repo外設定または実providerとの接続 | Cloudflare Access、Clerk、Stripe、security header、内部BI |
| 運用証跡 | 自動化で代替できない運用 | 脆弱性診断、マルウェア対策、権限棚卸し |

### 5.2 セキュリティ回帰の受け入れ条件

- 修正前の攻撃入力で検出テストが失敗し、修正後に成功することを確認する。
- 拒否結果だけでなく、DB row、scheduler、outbox、provider call、token消費が0件であることを確認する。
- session種別はテストDBの実体とcaller引数を一致させ、引数不一致だけで拒否されるfixtureを防御の証拠にしない。
- rate limitは同一tokenの反復だけでなく、攻撃者がtokenやprefixを変える入力を含める。
- lifecycleは境界時刻の直前、直後、重複、逆順、古いworkerを含める。
- 外部証跡にはTest ID、対象環境、exact commit SHA、provider accountまたはmode、実施日時、確認者、結果、アクセス制限済み証跡URLを残す。
- secret、token、個人情報、Webhook本文を本リポジトリの証跡へ貼り付けない。

### 5.3 追加しないテスト

- 内部BIには、現行リポジトリ規約と既存Stripe計画どおり新しい自動テストを追加しない。
- Worker body上限は413応答だけでは全量bufferの再発を検知できないため、早期打ち切りを観測できる計測付きcanaryを使うか、テスト禁止方針の変更を先に承認する。
- 静的見出しや文言の存在だけを確認するStorybook play functionは追加しない。
- 局所的なFunction Testで十分なCapability境界へ、新しいE2EやScenario Testを重複追加しない。
- malware対策、MFA、Clerk lockout、Radar設定をmockだけで「確認済み」にしない。

## 6. Codex Security候補30件の日本語整理

優先度はテストと証拠を整備する順序であり、正式な脆弱性severityではない。

| 候補 | 日本語での論点 | 2026-07-21時点 | 優先度 | 主担当の検証 |
|---|---|---|---|---|
| CAND-FR003-001 | 内部BI Workerに閲覧者認証がなく、内部secretが利用者認証と混同される | 環境確認待ち | P0 | Cloudflare AccessまたはIP制限のdeployed canary |
| CAND-FR003-002 | Workerが16 KiB判定前にrequest body全体をbufferする | 現行成立条件あり | P0 | stream reader境界の回帰または読取byte計測付きcanary |
| CAND-FR004-001 | 内部BI queryの店舗ごとのbounded readが乗算され、read量が膨らむ | 現行成立条件あり | P0 | preview容量probeと`analytics:*`検証 |
| CAND-FR004-002 | view sessionがfeature requestを書き込める | 現行成立条件あり | P0 | `convex/featureRequest/mutations.test.ts` |
| CAND-FR006-001 | URL正規化後に`//host`が生成され、外部へredirectできる | 現行成立条件あり、再現済み | P0 | `src/lib/auth/redirect.test.ts` |
| CAND-FR007-001 | 無効な招待tokenごとにrate limit stateを作らせられる | 現行成立条件あり | P0 | `convex/organizationInvitation/mutations.test.ts` |
| CAND-FR007-002 | 招待再送に長期間quotaがない | 現行成立条件あり | P0 | `convex/organizationInvitation/mutations.test.ts` |
| CAND-FR008-001 | 同じ請求先メールでもfresh request IDで通知と同期を繰り返せる | 現行成立条件あり | P1 | `convex/organizationBilling/mutations.test.ts` |
| CAND-FR009-001 | 用途欠落のlegacy magic linkをsubmitからviewへ昇格できる | 現行成立条件あり、外部PoCあり | P0 | `convex/staffAuth/mutations.test.ts` |
| CAND-FR011-001 | 永続的な登録linkからpending rowを無制限に増やせる | 現行成立条件あり、入口設計待ち | P0 | `convex/staffRegistration/mutations.test.ts`、HTTP化時は`http.test.ts` |
| CAND-FR011-002 | 登録結果の違いから登録済みstaffと申請済みemailを列挙できる | 現行成立条件あり | P0 | `convex/staffRegistration/mutations.test.ts` |
| CAND-FR014-001 | LINE stateの攻撃者指定prefixごとにrate limit stateを作らせられる | 現行成立条件あり、入口設計待ち | P0 | `convex/line/mutations.test.ts`、HTTP化時は`t.fetch` |
| CAND-FR014-002 | LINE token再発行後も古い未使用tokenが有効なまま残る | 現行成立条件あり | P0 | `convex/line/mutations.test.ts` |
| CAND-FR014-003 | LINE webhookのreplayと逆順eventが新しいfollow状態を上書きできる | 現行成立条件あり | P0 | `convex/line/webhook.test.ts` |
| CAND-FR016-001 | 通常LINE通知が送信直前に現在のLINE accountを再照合しない | 現行成立条件あり | P0 | `convex/notificationOutbox/actions.test.ts` |
| CAND-FR016-002 | processing outboxのlease回収と古いworkerを拒否するfencingがない | 現行成立条件あり | P0 | Function Testと`_scenario/notificationDelivery.test.ts` |
| CAND-FR016-003 | terminal outboxが宛先、本文、token、errorを無期限に保持する | 現行成立条件あり | P0 | Function Testとretention Scenario Test |
| CAND-FR017-001 | Resendのdelayedとdeliveredが逆順になると古い状態へ戻る | 修正済み、回帰あり | 完了 | 既存`convex/notificationOutbox/resendWebhook.test.ts`を維持 |
| CAND-FR017-002 | providerの生errorをlogと永続化先へ残し、期限後も消去しない | 現行成立条件あり | P0 | safe error Logic Testとoutbox Function Test |
| CAND-FR018-001 | 募集と確定通知のfanoutが一つのactionで、途中失敗から再開できない | 現行成立条件あり | P0 | `_scenario/notificationDelivery.test.ts` |
| CAND-FR018-002 | 確定通知再送にserver idempotencyと長期間quotaがない | 現行成立条件あり | P1 | `convex/shiftBoard/mutations.test.ts` |
| CAND-FR018-003 | dry-run抑止が最初のmanagerだけで決まり、行順に依存する | 現行成立条件あり、policy決定待ち | P0 | `convex/_lib/notificationDelivery.test.ts` |
| CAND-FR019-001 | submit sessionが確定シフトのview APIを読める | 現行成立条件あり、既存テストは攻撃形を未再現 | P0 | `convex/shiftView/queries.test.ts` |
| CAND-FR019-002 | staff個別通知再送に長期間quotaがない | 現行成立条件あり | P1 | `convex/staff/mutations.test.ts` |
| CAND-FR022-001 | PRコードと同じPlaywright jobへPreview credentialを渡す | 現行成立条件あり、実環境確認待ち | P0 | workflow静的検査とEnvironment証跡 |
| CAND-FR023-001 | PRコードを実行するpreview deploy jobへCloudflareとConvex credentialを渡す | 現行成立条件あり、実環境確認待ち | P0 | workflow静的検査とEnvironment証跡 |
| CAND-FR023-002 | canaryはPR headを承認するがreleaseはmoving mainをcheckoutする | 正式検証済み、現行も未解消 | P0 | immutable SHAの静的検査とruntime attestation |
| CAND-FR024-001 | 公開issueまたはcommentの`@claude`だけでsecret-backed actionを起動できる | 対象外（workflow廃止） | 完了 | workflowと専用テストを削除 |
| CAND-FR024-002 | PRコードを実行するVRT compare jobへHosting tokenを渡す | 現行成立条件あり、実環境確認待ち | P0 | workflow静的検査とpublisher分離 |
| CAND-FR024-003 | 環境設定CLIの失敗時にsecretがargvやerrorへ出る | 修正済み、回帰不足 | P1 | `scripts/setupEnv.test.ts` |

## 7. 実装ワークストリーム

### 7.1 WS-0 正式検証台帳と危険な既存契約の修正

#### 方針

30候補を一括で「脆弱性」と命名せず、候補ごとに正式検証の結論、product policy、修正PR、固定回帰、外部証跡を追跡する。

#### 作業

| ID | 作業 | 完了条件 |
|---|---|---|
| VAL-01 | 30候補のvalidation台帳を作る | `validated`、`suppressed`、`needs environment evidence`のいずれかと根拠が全件にある |
| VAL-02 | 現行worktreeとの差を再確認する | 実装開始時のcommit SHAと添付snapshotの差が対象ごとに記録される |
| VAL-03 | unsafe contractを期待する既存テストを置換する | FR011-002の識別応答などを成功契約として残さない |
| VAL-04 | 攻撃形を外したfixtureを修正する | FR004-002とFR019-001が実体sessionとcaller引数を一致させて失敗を検知する |

正式検証が未完了でも、現行コードで再現できるP0候補の検出テストは先に追加できる。

FR004-002は`doc/features/feature-requests.md`の現行仕様に従い、submit session限定を固定契約とする。

product policyで挙動が変わるFR011-001とFR018-003は、期待値を決めてから固定回帰をmergeする。

### 7.2 WS-1 releaseとCI credential境界

#### REL-01 同一artifactのrelease

対象は`CAND-FR023-002`である。

参照先は`.github/workflows/release.yml`と`.github/workflows/provider-canary-approval.yml`である。

次の契約を実装する。

- canary対象、checkout、build、deploy metadataを一つのimmutable SHAまたは内容digestへ束縛する。
- `main`などのmoving refをrelease時に再解決しない。
- version更新などcanary後にtreeを変える処理をrelease対象へ混ぜない。
- deploy credentialを使う前に`git rev-parse HEAD`、承認SHA、artifact metadataの完全一致をfail closedで確認する。
- mainの前進、追加push、別artifactの差し替えを拒否する。

`scripts/githubWorkflowSecurity.test.ts`ではYAMLをparseし、moving ref、承認SHA未使用、runtime照合欠落を検出する。

build once and promoteと、merge後のrelease candidateをcanaryする方式のどちらを採るかは、実装前に決める。

#### CI-01 PRコードとsecretを分離する

対象は`CAND-FR022-001`、`CAND-FR023-001`、`CAND-FR024-002`である。

参照先は`.github/workflows/playwright.yml`、`.github/workflows/deploy.yml`、`.github/workflows/vrt.yml`である。

次の契約を実装する。

- PRコードを実行するjobはsecretlessにする。
- credentialを持つpublisher jobはdefault branch上のtrusted codeだけを実行する。
- PR側のartifactは実行せず、定義済みのdata formatとして検査してから公開する。
- GitHub Environmentの承認、対象branch、credential scope、fork時の挙動を実環境で確認する。
- artifactの漏洩scanは維持するが、実行中のcredential持ち出し対策の代用にはしない。

`scripts/githubWorkflowSecurity.test.ts`では、untrusted event、PR checkout、secret参照、任意script実行が同じjobへ共存しないことを検査する。

#### CI-02 secret-backed botのactor認可

`CAND-FR024-001`は、secret-backed AI bot workflowを運用しない方針に変更したため対象外とする。
`.github/workflows/claude.yml`、Issue Templateの`@claude`起動文言、workflow専用テストは削除する。

### 7.3 WS-2 redirectとstaff Capability

#### CAP-01 post-normalization redirect

対象は`CAND-FR006-001`である。

`src/lib/auth/redirect.test.ts`へ、`/safe/..//evil.example`、encoded dot segment、backslash相当、auth loopを追加する。

戻り値は既定routeまたは厳密に一つの`/`から始まる同一origin pathだけとする。

helperを唯一の防壁として維持する場合、sinkのjsdom testは重複追加しない。

#### CAP-02 endpoint固有のaccessKind

対象は`CAND-FR004-002`と`CAND-FR019-001`である。

汎用wrapperへcallerが渡した`accessKind`を、endpoint固有権限の根拠にしない。

`convex/featureRequest/mutations.test.ts`では、実体がview sessionでcaller引数もviewのrequestを拒否し、`featureRequests`が0件であることを確認する。

`convex/shiftView/queries.test.ts`では、実体がsubmit sessionでcaller引数もsubmitのrequestが`null`または認可errorになり、view sessionだけが最小DTOを取得できることを確認する。

既存の引数不一致だけを試すScenario assertionは、攻撃形を保証する説明に使わず、重複していれば削除または目的を改名する。

#### CAP-03 legacy magic linkの用途固定

対象は`CAND-FR009-001`である。

`convex/staffAuth/mutations.test.ts`へ、confirmed recruitmentの用途欠落legacy linkをviewとして使うPoCを移植する。

拒否時はsession 0件、token未消費、staffとshop変更0件を確認する。

open recruitmentのlegacy submit救済を残す場合は、そのpositive caseも同じsuiteで維持する。

### 7.4 WS-3 公開登録、招待、LINEのabuse耐性

#### ABU-01 招待のstable budgetと長期間quota

対象は`CAND-FR007-001`と`CAND-FR007-002`である。

`convex/organizationInvitation/mutations.test.ts`へ次を追加する。

- 同一actorから異なる無効tokenを連続投入してもstable budgetのN+1回目が拒否される。
- 拒否時にorganization、person、member、invite、scheduler、outboxが変化しない。
- 別actorの正規acceptは攻撃者のbucketで妨害されない。
- 一分ごとに時刻を進めてもdaily capを越えられず、window経過後だけ再許可される。
- direct resendと共通reissueの両方が公開入口なら、両入口を検証する。

#### ABU-02 公開登録のcapとidentity非列挙

対象は`CAND-FR011-001`と`CAND-FR011-002`である。

まず、pending hard cap、bot proof、IP budgetを必要とするHTTP Actionへ移すか、現行public mutationで実装可能なcapとstable keyだけを採るか決める。

現行public mutationでは信頼できるclient IPを取得できないため、IP制限を実装済みと主張しない。

`convex/staffRegistration/mutations.test.ts`では、new、既存staff、pendingの公開DTOを同じgeneric responseへ固定する。

newだけがpending rowを一件作り、他二状態ではDB、scheduler、event、logの副作用が0件であることを確認する。

hard cap直前は一件だけ受理し、cap到達後はgeneric responseのままrowを増やさないことを確認する。

HTTP Action化する場合は、method、Content-Type、body size、Turnstile、IP、email、shop、global budgetを`t.fetch`で確認する。

UIのBehavior Testは、backendのgeneric契約に追従する状態遷移だけを変更し、静的文言の重複検証は追加しない。

#### ABU-03 LINE state、単一token、webhook順序

対象は`CAND-FR014-001`、`CAND-FR014-002`、`CAND-FR014-003`である。

`convex/line/mutations.test.ts`では次を確認する。

- 異なる無効state prefixでもstable budgetのN+1回目を拒否する。
- IPを契約にする場合は、入口をHTTP Actionへ移した後に`t.fetch`で確認する。
- 同じstaffとscopeへtokenを二回発行すると、旧tokenは失効し、新tokenだけが利用できる。
- activeかつunusedのtokenは厳密に一件である。
- manager issuerとinternal issuerの両入口が共通helperを通ることを各一件で固定する。

`convex/line/webhook.test.ts`では次を確認する。

- 同じevent IDの再送はno-opになり、通知とjobを増やさない。
- 同じmessage eventを別HTTP requestで再送してもReply APIは一回だけ呼び、receiptにreply token、本文、source IDを保存しない。
- 時刻T2のunfollow後に時刻T1のfollowを受けてもunfollowを維持する。
- event identity欠落を拒否するか、legacyとして受理するかを明文化して固定する。
- message receiptは期限境界と複数batchを固定し、削除後もprovider timestampが保持期間外のeventをno-opにする。

### 7.5 WS-4 通知workflow、送信時認可、retention

#### NOT-00 永続shapeのmigration判定

NOT-02、NOT-03、NOT-04でlease token、cursor、persisted scope、redaction状態を追加する前に、既存rowと予約済みjobへの互換性を決める。

既存の`@convex-dev/migrations`と`convex/migrations/`を使い、widen、migrate、narrowの順で展開する。

最初のdeployでは新fieldをoptionalにし、readerは旧shapeと新shapeを扱い、新規writeは新shapeを保存する。

backfillはbatchとcursorを使って再開可能にし、dry run、進捗監視、未移行rowが0件であることの検証を行う。

移行完了後のdeployでだけ、新fieldをrequiredにして旧shapeの分岐を除去する。

Scenario Testには次の旧shape fixtureを追加する。

- lease tokenを持たない既存`processing` rowが、生存期間中は二重取得されず、期限後は新leaseへ回収される。
- 旧workerまたは旧形式の完了requestが、新lease取得後の状態を上書きしない。
- 既存のterminal rowが期限に従ってredactされ、migrationとretentionを再実行しても結果が変わらない。
- 予約済みの旧fanout jobと新しいresumable operationが同時に存在しても、stable semantic keyで通知が重複しない。

`convex/notificationOutbox/migration.test.ts`では、旧shapeのbackfill、複数batchのresume、二回目実行のidempotency、未移行rowが0件になる検証queryを確認する。

optional fieldの追加だけでbackfill不要と判断する場合も、旧shapeを期限まで読み続ける条件とnarrow可能な判定方法を記録する。

#### NOT-01 送信直前のLINE宛先再照合

対象は`CAND-FR016-001`である。

`convex/notificationOutbox/actions.test.ts`では、通常LINE通知をenqueue後に旧accountをunfollowし、新accountへ再連携してからworkerを実行する。

旧user IDへのprovider callは0件で、outboxは`cancelled`または同等の`recipient_inactive`へ収束することを確認する。

再連携がないpositive caseでは一回だけ送信する。

#### NOT-02 processing leaseの回収とfencing

対象は`CAND-FR016-002`である。

`convex/notificationOutbox/mutations.test.ts`では、生きたleaseを再取得できないこと、期限切れleaseを新tokenで取得できること、旧tokenの完了を拒否することを確認する。

`convex/_scenario/notificationDelivery.test.ts`では、claim直後にworkerを中断し、期限後の通常workerまたはreaperで終端へ収束することを確認する。

provider idempotency key、outbox、dedupe rowに重複がないことも確認する。

#### NOT-03 terminal payloadとerrorのredaction

対象は`CAND-FR016-003`と`CAND-FR017-002`である。

宛先、本文、token、capability URL、provider body、生errorを期限後にprimary outboxとFailureInboxから除去する。

dedupeと監査に必要な最小metadataだけを残す。

safe error helperのLogic Testでは、email、token、JSON body、provider declineを示すsentinelが安全なtaxonomyへ変換されることを確認する。

Function TestではLINEとResendの失敗を発生させ、client response、console、delivery event、FailureInbox、outboxのどこにもsentinelがないことを確認する。

retention testでは期限直前と直後、sent、failed、cancelled、pending、processing、複数batch、再実行を確認する。

FR016-003とFR017-002を同じretention jobで直しても、テスト契約は別々に残す。

#### NOT-04 resumable fanout

対象は`CAND-FR018-001`である。

募集と確定通知にpersisted scope、cursor、leaseを持つbounded batchを導入する。

`convex/_scenario/notificationDelivery.test.ts`では、N件処理後に中断し、通常schedulerで再開する。

最終対象ID集合が期待集合と完全一致し、欠落と重複が0件であることを確認する。

stale lease回収、対象削除時cancel、provider idempotencyも含める。

#### NOT-05 再送のserver idempotencyと長期間quota

対象は`CAND-FR008-001`、`CAND-FR018-002`、`CAND-FR019-002`である。

`convex/organizationBilling/mutations.test.ts`では、同じ正規化済みemailと異なるrequest IDを連続送信し、二回目は`changed: false`、監査、通知、同期jobが各一件のままであることを確認する。

`convex/shiftBoard/mutations.test.ts`では、worker実行前に異なるclient IDと時刻で再送し、durable operationとjobが一件だけであることを確認する。

`convex/staff/mutations.test.ts`では、open recruitmentとcurrent shiftの両APIをtable-drivenにし、短時間上限と長期間上限を確認する。

quota拒否時はmagic link、scheduled job、outbox、provider callを増やさない。

`Date.now()`をoperation identityとして使わず、organization、shop、recipient、purpose、semantic versionからstable keyを作る。

actor単位とorganization単位のrate limit keyはoperation identityから分離する。

別managerが同じsemantic operationを実行しても、durable operation、job、outboxが各一件へ収束することを確認する。

#### NOT-06 dry-run policy

対象は`CAND-FR018-003`である。

最初に見つかったmanagerだけでdry-runを決める実装を廃止する。

推奨案は、active manager全員がallowlistに一致した場合だけ抑止するか、shopへ明示的な永続flagを持つ方式である。

`convex/_lib/notificationDelivery.test.ts`では、mixed managersを両方の挿入順で確認する。

all allowlisted、removed manager、managerなしも確認し、行順に依存しないpolicyを固定する。

#### NOT-07 既存回帰の維持

`CAND-FR017-001`は、現行の`convex/notificationOutbox/resendWebhook.test.ts`がdelayed、delivered、重複、逆順、legacyを直接確認している。

追加テストを作らず、既存回帰をP0 suiteの根拠として維持する。

### 7.6 WS-5 内部BIとresource上限

#### BI-01 閲覧者アクセス制御

対象は`CAND-FR003-001`である。

Cloudflare AccessまたはIP制限をWorker到達前へ適用する。

未認証の別browser contextから`/`と`/api/analytics`の両方を呼び、HTMLとAPIが拒否されることをdeployed canaryで確認する。

`SHIFTORI_INTERNAL_API_SECRET`はWorkerからConvexへのservice credentialであり、閲覧者の本人確認には数えない。

#### BI-02 request body上限

対象は`CAND-FR003-002`である。

`apps/analytics-dashboard/src/server/analyticsProxy.ts`で全量buffer前にbyte単位の上限を適用する。

413応答とConvex非到達だけでは、全量buffer後に拒否する現行の根因を検知できない。

第一案は、内部BIのテスト禁止方針を変更する承認を先に得て、synthetic `ReadableStream`が上限を越えた直後にcancelされ、未読のtailへ到達しないsecurity regressionを追加する方式である。

方針を変更しない場合は、staging Workerへ本文を保存しない`bytesRead`とupstream call数の一時的な計測を入れ、chunked requestとContent-Lengthなしの超過requestが全量読取前に413となることをcanaryで証明する。

計測なしの413だけでは、本項目を完了にしない。

#### BI-03 read amplification

対象は`CAND-FR004-001`である。

`convex/analyticsDashboard/queries.ts`を、日次snapshot、一覧paginationと詳細遅延取得、または同等のbounded readへ変更する。

新しい自動テストは追加せず、preview容量probeで最大想定店舗数の実行時間、読取量、応答サイズ、pageごとの上限を記録する。

内部BI本体の変更確認には`pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`を使う。

### 7.7 WS-6 setupEnvのsecret非露出

対象は`CAND-FR024-003`である。

現行`scripts/setupEnv.ts`はsecretをargvではなくstdinへ渡し、固定error messageを表示するため、調査時の根因は解消された可能性が高い。

`scripts/setupEnv.test.ts`ではchild process境界を差し替え、secret sentinelがargv、stdout、stderr、throwされたcommand情報、consoleへ出ないことを確認する。

正式再検証で根因解消を確認後、候補をcloseする。

## 8. Stripe六項目との対応

Stripeの公式資料は、[日本向けセキュリティチェックリスト](https://support.stripe.com/questions/japan-security-checklist?locale=ja-JP)、[card testing対策](https://docs.stripe.com/disputes/prevention/card-testing?locale=en-GB)、[test環境](https://docs.stripe.com/testing)、[Radarのtest](https://docs.stripe.com/radar/testing)、[3D Secure](https://docs.stripe.com/payments/3d-secure/authentication-flow?api-integration=checkout-session-api)を参照する。

詳細なTest IDと既存確認状況は`doc/plans/2026-07-20_Stripeセキュリティ対策_テスト計画.md`を正本とする。

### 8.1 管理者画面のアクセス制限

| 不足 | 検証 | 完了条件 |
|---|---|---|
| 内部BIの追加アクセス制限 | BI-01と統合 | HTMLとAPIをWorker到達前に拒否する |
| Clerk MFA | Clerk本番設定と使い捨てaccountの負の試験 | 採用した全login方式で追加要素が必須 |
| 10回以下のlockout | Clerk本番の使い捨てaccount | 規定回数後は正しいpasswordでも解除前に拒否 |
| 共有accountと不要権限 | 運用棚卸し | 共有account 0、退職者権限0、確認記録あり |
| 顧客向け管理画面のIP制限または代替 | Stripeへの確認と設計記録 | 申告内容と本番設定が一致する |

MFAとlockoutをmockしたunit testは、provider本番設定の証拠にしない。

### 8.2 公開directoryと重要file

`.github/workflows/security.yml`または既存のtrusted CIへ次を追加する。

- Git履歴のsecret scan。
- build後の`public/`、`dist/`、test report、CI artifactのscan。
- secret prefix、private key、`.env`実体、顧客情報、access log、認証済みstorage state、source mapのfail closed検査。

現行ではupload APIを確認していないため、拡張子制限は非該当とする。

upload機能を追加するPRでは、拡張子、MIME、実体、size、保存先、配信headerを再評価する。

### 8.3 Web applicationの脆弱性

本計画のCAP、ABU、NOT、CIのP0 Function Testを主担当とする。

CIにはsecret scan、dependency scan、SASTを追加する。

公開前、年一回、大きな認証または課金変更後にDASTまたは第三者診断を行い、CriticalとHighを修正する。

Medium以下を受容する場合は、責任者と期限を記録する。

現行はConvex query builderを使いraw SQLを利用していないため、SQL injectionは現在の構成では非該当とする。

XSS sanitizerの既存回帰は維持する。

### 8.4 malware対策

application testは追加しない。

開発者と運用担当者の端末について、DefenderまたはEDRの有効状態、realtime protection、signature更新、定期full scan、検知時の隔離とcredential rotation手順を証跡化する。

公開前に一回確認し、その後は定期運用として更新する。

### 8.5 card testingと本人確認

Hosted Checkoutを維持し、PAN、CVC、有効期限をシフトリへ入力、送信、保存しない。

Stripe Checkoutの自動防御だけに依存せず、Radar、3DS、認証済みsession、回数制限のうち申告する対策を明示する。

次の自動テストの追加または厳密化が不足している。

| ID | 追加先 | 契約 |
|---|---|---|
| STR-AUTO-01 | `convex/organizationStripe/webhook.test.ts` | non-POSTを拒否し、receipt、課金状態、schedulerの副作用0 |
| STR-AUTO-02 | `convex/organizationStripe/actions.test.ts` | SetupIntentのstatus、usage、customerとPaymentMethodのtype、customerが不正なら拒否 |
| STR-AUTO-03 | `convex/organizationStripe/actions.test.ts` | 各Checkout intentで`payment_method_types: ["card"]`、success URL、cancel URL、raw card field不在を直接確認 |
| STR-AUTO-04 | `convex/organizationStripe/webhook.test.ts`または課金状態の主担当suite | `invoice.payment_action_required`で成功前にPro化せず、回復後だけ収束 |
| STR-AUTO-05 | `convex/organizationStripe/actions.test.ts` | decline、email、tokenのsentinelがclient、log、永続状態へ出ない |

Content-Type、body上限、署名、timestamp、event shapeの拒否は、現行`convex/organizationStripe/webhook.test.ts`が直接確認しているため追加しない。

Checkout payloadのmode、customer、metadataは一部の経路で既存確認があるため、そのassertionを維持し、STR-AUTO-03では未確認項目と各intentへの適用だけを補う。

現行worktreeの`convex/organizationStripe/config.test.ts`には環境変数分離の回帰があるため、同じテストを追加しない。

Stripe sandbox canaryでは通常決済、3DS成功、3DS失敗、高riskまたはcard testing相当、Trial SetupIntent、Customer Portal、実Webhookを確認する。

Stripeがsandbox向けに提供するtest値だけを使い、実在するcard情報は使用しない。

認証成功前にPro化しないこと、CustomerとSubscriptionが各一件であること、利用者へ詳細なdecline理由を出さないこと、PANとCVCを保存しないことを確認する。

同一accountの入力回数制限を申告上の対策に選ぶ場合は、fresh request IDをまたぐuserとorganizationの短時間および長期間quotaを追加する。

拒否時はCustomer、Checkout Session、operation、provider callが0件であることをFunction Testで確認する。

IP制限を選ぶ場合、Convex actionからclient IPを信頼取得せず、Cloudflare WAFまたは専用HTTP境界で実装してcanaryを残す。

### 8.6 不正login対策

Clerk本番で採用する対策を、申告内容と一致させる。

MFA、10回以下のlockout、server-side throttle、login通知またはaccount変更通知を、設定exportと使い捨てaccountの負の試験で確認する。

保護routeの既存E2EとConvexのmanager認可テストは維持する。

Clerkのprovider制御を独自mockだけで再実装しない。

## 9. 実装順序

### Phase 0 証拠を固定する

1. `CAND-FR023-002`の正式検証結果をアクセス制限された追跡記録へ紐付ける。
2. 29候補へ正式検証ownerとenvironment evidenceの要否を割り当てる。
3. FR004-002、FR006-001、FR009-001、FR019-001の検出テストを、修正前に失敗する状態で作る。
4. product policy待ちのFR011-001とFR018-003を決定する。

### Phase 1 releaseと直接的な権限昇格を閉じる

1. REL-01を実装する。
2. CAP-01、CAP-02、CAP-03を実装する。
3. ABU-02のidentity非列挙を実装する。
4. 対象Logic TestとConvex Function Testを通す。

### Phase 2 公開入口とtoken lifecycleを閉じる

1. ABU-01、ABU-02のcap、ABU-03を実装する。
2. CI-01、CI-02のworkflow分離を実装する。
3. workflow静的検査とactionlintまたはzizmorを通す。

### Phase 3 通知workflowを回復可能にする

1. NOT-00でwiden-migrate-narrowの要否と旧shapeの扱いを確定する。
2. NOT-01、NOT-02、NOT-03を実装する。
3. NOT-04のfanoutをbounded batchへ変更する。
4. NOT-05、NOT-06を実装する。
5. Function Testの後にScenario Testで旧shape、中断、時刻経過、旧jobとの重複防止を確認する。

### Phase 4 外部設定とStripe証跡を完了する

1. BI-01、BI-02、BI-03を完了する。
2. STR-AUTO-01からSTR-AUTO-05を実装する。
3. Stripe、Clerk、Cloudflareのcanaryを実施する。
4. secret scan、SAST、dependency scan、DAST、malware対策の証跡を揃える。

## 10. 完了条件

- 30候補すべてにformal validationまたはenvironment evidenceの結論がある。
- `CAND-FR023-002`は、canaryとproductionが同じimmutable SHAまたはartifactを使う自動検査と実release証跡を持つ。
- P0の現行成立候補は、攻撃形を直接再現する検出テストと副作用0件のassertionを持つ。
- Scenario対象は、中断、時刻経過、stale lease、再実行後に期待する終端へ収束する。
- 永続shapeを変える項目は、旧rowと予約済み旧jobの互換テスト、dry run、未移行0件の確認を終えてからschemaをnarrowする。
- Stripeの六項目は、自動テスト、Provider canary、環境設定、運用証跡のどれで確認したかが明確である。
- `apps/analytics-dashboard/`へ規約外の自動テストを追加していない。
- secret、token、顧客情報をrepository、test output、artifact、証跡本文へ残していない。
- lint warning、type error、対象testの失敗、想定外のskipが0件である。
- 実装後の日本語コードレビューでP0とP1の未修正指摘がない。

## 11. 実装時の検証command

変更した主担当suiteから実行し、最後に全体確認へ進む。

```bash
pnpm vitest --project=logic src/lib/auth/redirect.test.ts
pnpm vitest --project=logic scripts/githubWorkflowSecurity.test.ts scripts/setupEnv.test.ts
pnpm vitest --project=convex convex/featureRequest/mutations.test.ts
pnpm vitest --project=convex convex/shiftView/queries.test.ts
pnpm vitest --project=convex convex/staffAuth/mutations.test.ts
pnpm vitest --project=convex convex/staffRegistration/mutations.test.ts
pnpm vitest --project=convex convex/organizationInvitation/mutations.test.ts
pnpm vitest --project=convex convex/line/mutations.test.ts convex/line/webhook.test.ts
pnpm vitest --project=convex convex/notificationOutbox/mutations.test.ts convex/notificationOutbox/actions.test.ts
pnpm vitest --project=convex convex/notificationOutbox/migration.test.ts
pnpm vitest --project=convex convex/_scenario/notificationDelivery.test.ts
pnpm vitest --project=convex convex/organizationStripe/actions.test.ts convex/organizationStripe/webhook.test.ts
pnpm analytics:lint
pnpm analytics:type-check
pnpm analytics:build
pnpm lint
pnpm type-check
pnpm test
```

Playwright、Vite、Storybook、ConvexのserverはCodexから新しく起動しない。

deployed canaryは、ユーザーが起動または公開した対象環境へ実施する。

## 12. 参考file

### 規約と既存計画

- `doc/rules/security-strategy.md`
- `doc/rules/testing-strategy.md`
- `doc/rules/convex-design-strategy.md`
- `doc/rules/frontend-architecture.md`
- `doc/features/feature-requests.md`
- `convex/AGENTS.md`
- `.github/AGENTS.md`
- `e2e/AGENTS.md`
- `doc/plans/2026-07-20_Stripeセキュリティ対策_テスト計画.md`
- `doc/plans/2026-07-20_Stripe課金連携_実装計画.md`

### 主な実装対象

- `src/lib/auth/redirect.ts`
- `convex/_lib/functions.ts`
- `convex/featureRequest/mutations.ts`
- `convex/shiftView/queries.ts`
- `convex/staffAuth/mutations.ts`
- `convex/staffRegistration/mutations.ts`
- `convex/organizationInvitation/mutations.ts`
- `convex/line/mutations.ts`
- `convex/line/webhook.ts`
- `convex/notificationOutbox/actions.ts`
- `convex/notificationOutbox/mutations.ts`
- `convex/notification/actions.ts`
- `convex/_lib/notificationDeliveryQueries.ts`
- `convex/migrations/index.ts`
- `convex/organizationBilling/mutations.ts`
- `convex/organizationStripe/actions.ts`
- `convex/organizationStripe/webhook.ts`
- `convex/analyticsDashboard/queries.ts`
- `apps/analytics-dashboard/src/server/analyticsProxy.ts`
- `scripts/setupEnv.ts`
- `.github/workflows/playwright.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/vrt.yml`
- `.github/workflows/release.yml`
- `.github/workflows/provider-canary-approval.yml`

### 外部資料

- [Stripe 日本向けセキュリティチェックリスト](https://support.stripe.com/questions/japan-security-checklist?locale=ja-JP)
- [Stripe card testing対策](https://docs.stripe.com/disputes/prevention/card-testing?locale=en-GB)
- [Stripe test環境](https://docs.stripe.com/testing)
- [Stripe Radarのtest](https://docs.stripe.com/radar/testing)
- [Stripe 3D Secure](https://docs.stripe.com/payments/3d-secure/authentication-flow?api-integration=checkout-session-api)
- [GitHub Actions deployment protection rules](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)

GitHub Environmentの保護はcredential利用前の承認に使えるが、canaryとdeployが同じartifactであることは別途repository側で束縛する。
