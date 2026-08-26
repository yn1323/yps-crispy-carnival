# セキュリティ再検証

> 文書種別: manual
>
> 対象: リポジトリ内の安全契約と、GitHub、Cloudflare、Clerk、Stripe、Convexの実環境証跡
>
> 履歴: [2026-07-21の再検証台帳](../archive/audits/2026/security-validation-2026-07-21.md)

セキュリティ修正は、テストが通った時点では完了しない。
リポジトリで確認できる安全契約と、実環境でしか確認できない設定や実行結果を分け、同じcommitに対応する証跡を残す。

## 証跡の単位

一件の証跡には、次の情報を記録する。

| 項目 | 記録する内容 |
|---|---|
| Test ID | 下表の識別子 |
| 対象環境 | production、staging、Stripe sandboxなど |
| 対象revision | exact commit SHA。releaseではtag、merge SHA、tree SHAも記録する |
| 外部対象 | provider account、deployment、mode。秘密値そのものは記録しない |
| 実施 | 日時、確認者、実行した手順 |
| 結果 | 成功、失敗、保留と、その判定根拠 |
| 証跡 | アクセス制限されたURLまたは保存先 |
| 復旧先 | 失敗時に停止する処理と担当者 |

secret、token、認証header、Webhook本文、個人情報、実在するカード情報は証跡へ含めない。
公開URLへ保存できない証跡は、アクセス制限された保管先へ置く。

## リポジトリ内の再検証

最初に対象commitと未コミット差分を記録する。

```bash
git rev-parse HEAD
git status --short
```

変更範囲に応じて、ルートの`AGENTS.md`が定めるlint、型検査、テスト、buildを実行する。
内部BIを変更した場合は、`pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`も実行する。

安全契約は、変更した境界に近いテストで確認する。
たとえば、Convexの認可、token、Webhook、通知、課金は該当するFunction TestまたはScenario Testを使い、Playwright設定と環境変数の秘匿は`scripts/playwrightConfigSecurity.test.ts`と`scripts/setupEnv.test.ts`で確認する。

明示された計画でtestの追加、更新、実行を除外する場合は、実行しなかったcommandとsuite、残留risk、代替した静的検証またはdata invariantを証跡へ記録する。  
testを実行していないrevisionを「test成功」として扱わず、環境確認や静的検証からtest結果を推測しない。

過去の監査台帳に記載された`scripts/githubWorkflowSecurity.test.ts`は現行リポジトリに存在しない。
GitHub Actionsの権限、trigger、Environment gate、artifactの信頼境界は、`.github/workflows/`の実装と実行履歴を組み合わせて確認する。

リポジトリ検証の成功を、production設定やdeploy済みartifactの証明として扱わない。

認証済みroute切替では、次の安全契約を同じrevisionで確認する。

- `/dashboard`は`org`と`shop`、`/account`は`flow`と`oauth`だけをsearchへ残し、未知key、空値、`token`、`code`、`state`を認証復帰前に除去する。
- `/actions`、`/manage*`、`/shifts*`、`/staff*`はrouteごとの許可済みsearchだけを認証復帰前に残し、旧`/app/*`からの互換redirectも同じ正規化済みsearchだけを引き継ぐ。
- URLの組織、店舗、人物、募集IDを認可根拠にせず、Convex public functionがactorのcanonical所属と対象の一致を再検証する。
- `/app`は`/dashboard`へ収束させる。旧`/app/actions`、`/app/manage*`、`/app/shifts*`、`/app/staff*`はcanonical routeへreplaceし、`/app/home`、`/app/account`、旧`/settings*`、`/users/*`、`/shops/*`、`/shiftboard/*`は互換redirectなしで削除する。
- 複数組織、複数店舗、複数管理者、支払いのdirect routeとpublic mutation/actionは、認証、組織境界、管理者状態、契約状態、上限、Stripe設定を副作用前に再確認する。
- 初回Setupは所属0件の本人だけに1組織、1店舗、管理者本人を作り、二重実行を拒否する。  任意のプロモーションコードが空欄なら3か月のTrialを作り、Trial期限処理を一度だけ予約し、Stripe Customer、Subscription、課金operationを作らない。
- server側に設定した`PROMOTION_COMPLIMENTARY_PRO_CODE`と、trim・大文字化した6桁英数字の入力が一致する場合だけ`complimentary.pro`を付与する。  この経路ではTrial期限処理、Stripe Customer、Subscription、課金operationを作らない。
- 事前照合は認証と所属0件を確認し、成功・失敗とも組織、店舗、課金状態、scheduler、Outbox、auditを作らない。  成功結果をcapabilityとして信用せず、最終Setupでコードと所属状態を再照合する。
- コードの形式不正、server側の未設定、不一致はSetupを拒否し、DB document、scheduler、Outbox、audit、外部provider呼び出しを0件にする。  コードの実値をlogや検証証跡へ残さず、frontendの10回・10分の試行制限を安全境界として扱わない。

権限、組織境界、契約状態、上限、Stripe設定で拒否するFunction Testでは、DB document、scheduler、Outbox、audit、外部provider呼び出しが0件であることまで確認する。
Playwright用Previewで通常経路を確認しても、Productionへのartifact反映とprovider設定の確認を代替しない。

## 実環境の確認項目

| Test ID | 対象 | 完了条件 |
|---|---|---|
| `ENV-BI-01` | Cloudflare Access | 未認証の別browser contextからHTMLとAPIの両方がWorker到達前に拒否される |
| `ENV-BI-02` | Analytics credential | Workerのservice credentialがHTML、JavaScript、API response、browser logへ露出しない |
| `ENV-BI-03` | Analytics完全性 | pipeline停止時またはpartial時に、古い値や不完全な率を正常値として表示しない |
| `ENV-BI-04` | Worker body上限 | Content-Lengthなしの16 KiB超過requestが全量読取前に413となり、Convex callが0件になる |
| `ENV-BI-05` | Analytics容量 | 最大想定店舗数でread document数とbytes、write document数とbytes、実行時間をphase別に記録し、Analytics一覧が初期50件・最大100件、`/requests`が最大50件、trendが最大366点、responseが512 KiB未満であることを確認する |
| `ENV-CI-01` | GitHub Actions公開境界 | 対象branch、trigger、fork制約、最小permissions、Environment gate、同じworkflowで検証したartifactだけを公開する契約が実行履歴と一致する |
| `ENV-REL-01` | Production release | canary head、merge SHA、tree SHA、tag、Convex、Cloudflare metadataが同じreleaseを示す |
| `ENV-ROUTES-01` | 認証済みroute | canonicalな`/dashboard`、`/account`、`/actions`、`/manage*`、`/shifts*`、`/staff*`が表示され、`/app`と互換対象の旧`/app/*`が正規化済みsearchで所定のcanonical routeへ収束し、削除した旧routeが404になる |
| `ENV-CAPABILITIES-01` | 組織管理機能 | Productionのdirect routeとpublic APIが、組織作成、店舗追加、管理者招待、課金の認証、組織境界、管理者状態、契約状態、上限をserver-sideで再確認する |
| `ENV-SETUP-01` | 初回Setupの通常経路 | 専用の新規actorがプロモーションコードを空欄にして1組織、1店舗、1管理者、3か月のTrialを作り、再実行が拒否され、Trial期限処理が一度だけ予約され、Stripe Customer、Subscription、課金operationがない |
| `ENV-SETUP-02` | 初回Setupの有効コード経路 | アクセス制限された検証環境で有効なコードを事前適用でき、事前照合では作成副作用がなく、最終Setupで`complimentary.pro`が付与され、Trial期限処理、Stripe Customer、Subscription、課金operationがなく、コードの実値が証跡に残らない |
| `ENV-SETUP-03` | 初回Setupの無効コード経路 | 形式不正、server側の未設定、不一致をそれぞれ一般化したエラーで拒否し、DB document、scheduler、Outbox、audit、外部provider呼び出しが0件で、コードの実値がlogや証跡に残らない |
| `ENV-STRIPE-01` | Stripe sandbox | 通常、3DS成功、3DS失敗、高risk、Trial SetupIntent、Portal、実Webhookをtest値で確認する。Secret、mode、Price、Customer、Subscriptionの不整合ではprovider副作用前に拒否することも確認する |
| `ENV-STRIPE-02` | Stripe設定 | 公開文書で申告するRadar、3DS、card testing対策と実account設定が一致する |
| `ENV-REG-01` | 公開スタッフ登録 | 本番Turnstile、許可Origin、8 KiB超過拒否をdeployed canaryで確認する |
| `ENV-CLERK-01` | Clerk | MFA、lockout、server throttle、loginまたはaccount変更通知を負の試験で確認する |
| `ENV-CLERK-02` | Clerk Developmentのログイン方法 | 4状態を使い分け、入力した確認済みメールのPrimary化、メール・パスワード追加、Google追加、同一メールと異なるメールの条件付き解除が同じClerk Userの契約どおりに完了し、失敗時も既存方法を維持する。両方のログイン方法が同じUserへ戻り、Google再ログイン後もPrimaryが戻らないことと、Productionを変更していないことも記録する |
| `ENV-CLERK-03` | Googleログインの中断と継続 | Google画面から戻る、取消、即時再試行、正常完了、Client Trustを確認し、Clerk既製画面やAccount Portalを表示せず、Clerkが作成したsessionで保持したredirectへ完了する |
| `ENV-OPS-01` | 端末と診断 | EDR、signature更新、full scan、隔離、credential rotation、DASTまたは第三者診断を記録する |

IP由来の制限を有効にする場合は、ingressが利用者指定headerを破棄し、信頼できる値へ上書きする証跡を先に確認する。
確認できないheaderを、認証や単独の許可条件に使わない。

## Clerk Developmentでのログイン方法受入

`ENV-CLERK-02`は、Clerk Development instanceと、確認者が管理する専用テスト利用者で行う。
共有E2E利用者、実在顧客、用途を確認できない既存利用者は変更しない。
対象revisionとDevelopment instanceを固定し、操作前にClerk `user.id`、Primary EmailAddress、確認済みEmailAddress、`passwordEnabled`、Google ExternalAccountの状態をアクセス制限された証跡へ記録する。

この受入ではProductionの設定、利用者、ExternalAccount、EmailAddressを変更しない。
Developmentの結果からProductionでの成立や公開済み状態を推測せず、将来Productionで確認する場合は対象revisionと変更許可を改めて固定する。

### 事前確認

最初に、DevelopmentでGoogle social connection、email/password sign-in、EmailAddressの`email_code`確認、account linking、reverification、利用者によるメール識別子の変更が有効であることを確認する。
Account linkingのredirectは`/account?flow=connect-google&oauth=google`専用とし、削除した`/app/account`、sign-in用`/sso-callback`、任意originへ流さない。

GoogleログインとGoogle新規登録は、`/sso-callback`を認証継続先として確認する。  Clerkの許可redirect URL、Google social connection、Client Trust、必須sign-up fieldのDevelopment設定を記録し、Account Portalの設定に依存せずシフトリの`/login`、`/signup`、`/sso-callback`へ戻ることを確認する。

テスト利用者は、次の4状態をそれぞれ用意する。

| ケース | 初期状態 |
|---|---|
| A | 確認済みGoogle ExternalAccountだけ |
| B | 確認済みEmailAddressとパスワードだけ |
| C1 | Google ExternalAccount、そのGoogleと同じ確認済みPrimary EmailAddress、パスワード |
| C2 | Google ExternalAccount、そのGoogleへexactにlinkedした確認済み非Primary EmailAddress、そのGoogleと異なる確認済みPrimary EmailAddress、パスワード |

ケースC2では操作前に、非Primary EmailAddressの`linkedTo`が対象ExternalAccountの`identificationId`と`oauth_google`で一対一に対応することを、アクセス制限されたDevelopmentのClerk User詳細で確認する。  メールアドレスやIDの値そのものは検証記録へ残さない。

### 状態変更の確認

アカウント変更の各操作では開始前と完了後にcurrent Userをreloadし、同じClerk `user.id`であることと、操作対象のresourceがそのUserに属することを確認する。
アカウント変更処理中に別Userの作成、User間の自動統合、sessionの取り違えがあれば失敗とする。  Google解除後の再ログインは、ケースC1とC2の期待結果を個別に確認する。

1. メールアドレス変更へ到達できるケースB、C1、C2では、入力した確認済みメールがPrimaryになることと、既存のGoogle ExternalAccountとパスワードが維持されることを確認する。  直前の旧Primaryの`linkedTo`に`oauth_google`が含まれるケースC1では、そのEmailAddressが`oauth_google`を含む確認済みsecondaryとして残ることを確認する。  `oauth_google`を含まない旧Primaryは削除され、変更前から存在したほかのsecondary EmailAddressは推測削除されないことも確認する。
2. 未確認の変更先は正しい確認コードを受け付けるまでPrimaryにならず、誤ったコード、期限切れ、取消後も元のPrimaryが維持されることを確認する。
3. GoogleのみのUserへ、Googleと異なる新たなメールアドレスを入力して確認し、パスワードを追加する。  入力した確認済みEmailAddressがPrimaryになり、Google-linked EmailAddressが同じlinkを持つ確認済みsecondaryとして残り、Google ExternalAccountが維持されることを確認する。  同じGoogleメールを入力するケースでも、重複EmailAddressを作らずパスワード設定が完了することを確認する。
4. ケースAの設定完了後にログアウトし、入力したPrimaryとパスワードでログインして操作前と同じClerk `user.id`へ戻ることを確認する。  再度ログアウトしてGoogleでログインし、同じ`user.id`へ戻ること、Primaryが入力したメールアドレスのままでGoogleメールへ戻らないこと、Google ExternalAccountとGoogle-linked secondary EmailAddressが維持されることを確認する。
5. メール・パスワードのみのUserへGoogle ExternalAccountを追加し、同じメールアドレスと異なるメールアドレスのどちらでも、current Userへの接続として完了することを確認する。
6. 別のClerk Userへ接続済みのGoogleアカウントを追加し、Userの統合や既存方法の変更を行わず、衝突として失敗することを確認する。
7. Google OAuthの成功、利用者による取消、provider失敗、帰還後のUser不一致を区別し、失敗時に既存のメール・パスワードが残ることを確認する。
8. 衝突、取消、provider失敗後に`failed`または`unverified`のGoogle ExternalAccountが一件だけ残った場合は、「Googleを再接続」を押す。  同じUser、同じPrimary、メール・パスワードの退避方法、exact resourceの所属を再確認した後、その未完了resourceだけを破棄し、新しいGoogleアカウント選択画面を開くことを確認する。
9. 未完了Googleの破棄応答が失われた場合は、reloadでexact resourceの不在を証明できたときだけ新しいOAuthを開始することを確認する。  resourceが残る場合、検証済みになった場合、Google resourceが複数ある場合、verification statusが未知の場合は、推測削除や新しいOAuthを行わないことを確認する。
10. Googleとメール・パスワードの両方を持つUserでは、有効なパスワードと確認済みPrimary EmailAddressを直前のreloadで確認した場合だけGoogleを解除できることを確認する。
11. GoogleのみのUserでは解除操作へ到達できず、直接操作を試みても拒否されることを確認する。
12. ケースC1でGoogleを解除し、対象ExternalAccountだけが不在になり、Primary EmailAddress、パスワード、無関係なsecondary EmailAddressが維持されることを確認する。  ログアウト後に同じGoogleでログインした場合は、account linkingによって同じClerk `user.id`へ再連携され得ることを期待結果として記録する。
13. ケースC2では確認画面にGoogle由来の非Primary EmailAddressや削除対象を表示せず、「このGoogleアカウントではログインできなくなります」「メールアドレスとパスワードは残ります」と案内することを確認してからGoogleを解除する。  対象ExternalAccountと、そのGoogleへexactにlinkedした一意の確認済み非Primary EmailAddressが不在になり、Primary EmailAddress、パスワード、無関係なsecondary EmailAddressが維持されることを確認する。  Primaryとパスワードでのログインは元のClerk `user.id`へ戻り、解除したGoogleでのログインは元の`user.id`へ戻らないことも確認する。

14. ケースC2相当でGoogleへlinkedしたEmailAddressを一意に特定できない場合、cleanup対象がPrimaryである場合、またはPrimaryとパスワードのfallbackが操作直前に変わった場合は、ExternalAccountとEmailAddressのどちらも変更せず解除を拒否することを確認する。
15. Google解除の応答が失われた場合は、reloadで期待する全resourceの不在とfallbackの保持を確認できた場合だけ成功を表示することを確認する。  ケースC2でExternalAccountだけが不在になりEmailAddressが残った場合は成功を表示せず、同じ確認ダイアログを閉じずに最新状態からEmailAddressのcleanupを再試行できることを確認する。  cleanup未完了中はキャンセルや閉じる操作が表示されないことも確認する。
16. メール変更のPrimary切替または旧Primary処理で応答を失った場合はreloadし、入力した確認済みメールがPrimaryで、`linkedTo`に`oauth_google`を含む旧Primaryがsecondaryとして残り、Google ExternalAccountとパスワードが維持されていれば成功へ収束することを確認する。  `oauth_google`を含まない旧Primaryの削除が必要な場合は、その不在も確認する。  完了条件を満たさない場合は成功を表示せず、確認済みの変更先を重複作成せずに再利用し、旧Primaryへ戻せる状態ではrollbackしてから再試行することを確認する。
17. GoogleのみのUserへのメール・パスワード設定でPrimary切替またはパスワード設定の応答を失った場合はreloadし、入力した確認済みEmailAddress、Primary、`passwordEnabled`、Google-linked secondary EmailAddress、Google ExternalAccountから完了済みの段階を判定する。  再試行では同じEmailAddress IDを使い、未完了の処理だけを続け、Google resourceを削除しないことを確認する。
18. 同じtab内の連打はsingle-flightで抑止され、確認コード送信とGoogle OAuth開始は画面遷移やOAuth往復後も30秒の絶対期限まで再送されないことを確認する。  2つのtabから同じ操作を開始した場合は、各操作直前のreloadとClerk serverの拒否により、少なくとも一つのログイン方法が残ることを確認する。
19. 任意のEmailAddress削除、パスワード削除、専用のGoogle置換操作が画面とURL状態に存在しないことを確認する。  EmailAddressの自動削除は、Primary変更時に`linkedTo`へ`oauth_google`を含まない直前の旧Primaryと、Google解除時にexactに特定した非Primaryだけに限られ、Primary変更後の`oauth_google`を含む旧Primaryはsecondaryとして残ることを確認する。
20. Gmail以外のメールアドレスと通常buildでも、状態に応じたGoogle追加または解除へ到達できることを確認する。

### Googleログインの中断・再試行

`ENV-CLERK-03`は、Googleログイン用の既存利用者とGoogle新規登録用の未登録利用者を分け、対象revisionを固定して行う。  token、確認コード、完全なメールアドレス、OAuth responseは検証記録、URL、browser logへ残さない。

1. `/login?redirect=/dashboard`からGoogle認証を開始し、Google画面でブラウザバックする。シフトリのログイン画面へ戻り、Clerk既製画面とAccount Portalが表示されないことを確認する。
2. 待機や手動再読み込みをせずGoogleボタンを再度押し、新しいGoogle認証画面を一回だけ開けることを確認する。Chrome、Safari、モバイルのうち利用対象のbrowserで、BFCacheから復帰した場合も同じ結果になることを記録する。
3. provider側の取消またはcallbackの未対応状態では、sessionを作らずシフトリの回復画面で停止することを確認する。「最初からやり直す」を押した場合だけ認証画面へ戻り、ブラウザバックで消費済みcallbackへ戻らないことを確認する。
4. 既存Google利用者の正常完了では同じClerk Userのsessionが有効になり、queryやhashを含む許可済みの`redirect`が保持されることを確認する。外部URL、protocol-relative URL、認証route自身は`/dashboard`へ収束することを確認する。
5. 新規Google利用者でtransferまたは追加要件が発生した場合は、対応済み状態だけをシフトリUIで継続し、未対応field、メール以外のMFA、新しいパスワード、Protect、未知状態ではsessionを作らないことを確認する。
6. Client Trustで`email_code`が返る場合は、シフトリの本人確認画面から送信、再送、検証を行い、`complete`とsession IDを確認した場合だけ保持redirectへ進むことを確認する。
7. LINE内ブラウザでは既存どおりGoogleボタンが外部ブラウザで同じURLを開き直し、その操作だけではClerk attemptをresetしないことを確認する。

### 分離契約とPIIの確認

Primaryメールアドレスやログイン方法を変更しても、`users.email`、`organizationPeople.email`、`staffs.email`、`organizations.billingEmail`は変更されないことを確認する。
管理者招待では、接続済みpersonを内部user IDで、未接続・外部招待をClerk Backend APIの確認済みEmailAddress所有で検証する既存契約を維持する。

メールアドレス、確認コード、Clerk User payload、user ID、resource ID、tokenがURL、browser console、Convex log、audit、analyticsへ新規記録されていないことを確認する。
スクリーンショットを保存する場合はPIIを除き、アクセス制限された保管先だけを使う。

証跡には各操作の成功、失敗、保留と、操作前後で`user.id`が一致したかを記録する。
Developmentの事前設定確認と、対象revisionを使った操作受入は別の結果として記録し、片方の成功からもう片方を推測しない。

## Convex migrationの再検証

`notificationOutbox`と`notificationFailureInbox`のredaction migrationは、対象deploymentごとに完走とreadinessを別々に確認する。
`--deployment`には短縮名ではなく、CLIが表示する完全修飾deployment名を指定する。

```bash
npx convex run --component migrations lib:getStatus --watch --deployment <fully-qualified-deployment>
npx convex run notificationOutbox/maintenance:getRedactionReadiness --deployment <fully-qualified-deployment>
```

`m019_notification_outbox_terminal_redaction`と`m020_notification_failure_inbox_redaction`がともに`isDone: true`かつ`state: "success"`であることを確認する。
続いて、readiness queryが`ready: true`を返すことを確認する。

dual-read、migration完走、readiness成立の三条件を対象deploymentで確認するまでschemaをnarrowしない。
失敗または対象deploymentの取り違えがあれば作業を止め、状態を変更せずに担当者へ引き継ぐ。

## 公開状態の記録

実環境の結果は、永続的な機能説明へ直接書き込まない。
[リリース状態](release-status.md)に対象revision、完全修飾deployment名、確認日時、証跡を記録する。

未確認の項目は「未確認」のまま残す。
リポジトリの実装やローカルテストから、公開済み、migration完了、販売可能と推測しない。

## 停止と復旧

次のいずれかに該当したら、その手順の完了を記録しない。

- 対象commit、deployment、provider modeを一意に特定できない。
- 証跡にsecret、token、個人情報が含まれている。
- 期待したserver-side enforcementを実環境で再現できない。
- migration statusとreadinessのどちらかが未完了である。
- release metadataが同じrevisionを示していない。

失敗時は、販売開始、schemaのNarrow、credentialを使う公開処理など、該当する次工程を止める。
既存契約のWebhook、安全な取消、再照合まで止めるかどうかは、対象機能の復旧手順と業務契約に従って判断する。

## 参照先

- `doc/rules/security-strategy.md`
- `doc/rules/convex-design-strategy.md`
- `doc/rules/testing-strategy.md`
- `doc/manual/ci-cd.md`
- `doc/manual/analytics-rollout.md`
- `doc/features/notification-outbox.md`
- `.github/AGENTS.md`
- `convex/AGENTS.md`
