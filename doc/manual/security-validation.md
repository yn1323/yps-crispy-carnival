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
| `ENV-STRIPE-01` | Stripe sandbox | 通常、3DS成功、3DS失敗、高risk、Trial SetupIntent、Portal、実Webhookをtest値で確認する |
| `ENV-STRIPE-02` | Stripe設定 | 公開文書で申告するRadar、3DS、card testing対策と実account設定が一致する |
| `ENV-REG-01` | 公開スタッフ登録 | 本番Turnstile、許可Origin、8 KiB超過拒否をdeployed canaryで確認する |
| `ENV-CLERK-01` | Clerk | MFA、lockout、server throttle、loginまたはaccount変更通知を負の試験で確認する |
| `ENV-CLERK-02` | Clerk Developmentのログイン方法 | 3状態でPrimaryメール変更、メール・パスワード追加、Google追加と条件付き解除が同じClerk Userのまま完了し、失敗時も既存方法を維持する。Productionを変更していないことも記録する |
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
Account linkingのredirectは`/account/security`専用とし、sign-in用`/sso-callback`や任意originへ流さない。

テスト利用者は、次の3状態をそれぞれ用意する。
Googleとメール・パスワードの両方を持つ状態では、同じメールアドレスを使うケースと異なるメールアドレスを使うケースを分ける。

| ケース | 初期状態 |
|---|---|
| A | 確認済みGoogle ExternalAccountだけ |
| B | 確認済みEmailAddressとパスワードだけ |
| C | Google ExternalAccount、確認済みEmailAddress、パスワードの両方 |

### 状態変更の確認

各操作では開始前と完了後にcurrent Userをreloadし、同じClerk `user.id`であることと、操作対象のresourceがそのUserに属することを確認する。
別Userの作成、User間の自動統合、sessionの取り違えがあれば失敗とする。

1. 3状態すべてでPrimaryメールアドレスを変更し、以前のEmailAddressと既存のGoogle ExternalAccount、パスワードが維持されることを確認する。
2. 未確認の変更先は正しい確認コードを受け付けるまでPrimaryにならず、誤ったコード、期限切れ、取消後も元のPrimaryが維持されることを確認する。
3. GoogleのみのUserへ、Googleと同じ確認済みEmailAddressまたは新たに確認したEmailAddressを使ってパスワードを追加し、Google ExternalAccountが残ることを確認する。
4. メール・パスワードのみのUserへGoogle ExternalAccountを追加し、同じメールアドレスと異なるメールアドレスのどちらでも、current Userへの接続として完了することを確認する。
5. 別のClerk Userへ接続済みのGoogleアカウントを追加し、Userの統合や既存方法の変更を行わず、衝突として失敗することを確認する。
6. Google OAuthの成功、利用者による取消、provider失敗、帰還後のUser不一致を区別し、失敗時に既存のメール・パスワードが残ることを確認する。
7. 衝突、取消、provider失敗後に`failed`または`unverified`のGoogle ExternalAccountが一件だけ残った場合は、「Googleを再接続」を押す。  同じUser、同じPrimary、メール・パスワードの退避方法、exact resourceの所属を再確認した後、その未完了resourceだけを破棄し、新しいGoogleアカウント選択画面を開くことを確認する。
8. 未完了Googleの破棄応答が失われた場合は、reloadでexact resourceの不在を証明できたときだけ新しいOAuthを開始することを確認する。  resourceが残る場合、検証済みになった場合、Google resourceが複数ある場合、verification statusが未知の場合は、推測削除や新しいOAuthを行わないことを確認する。
9. Googleとメール・パスワードの両方を持つUserでは、有効なパスワードと確認済みEmailAddressを直前のreloadで確認した場合だけGoogleを解除できることを確認する。
10. GoogleのみのUserでは解除操作へ到達できず、直接操作を試みても拒否されることを確認する。
11. Google解除の応答が失われた場合は、reloadした最新状態から成功または未完了を判定できることを確認する。
12. 同じtab内の連打はsingle-flightで抑止され、確認コード送信とGoogle OAuth開始は画面遷移やOAuth往復後も30秒の絶対期限まで再送されないことを確認する。  2つのtabから同じ操作を開始した場合は、各操作直前のreloadとClerk serverの拒否により、少なくとも一つのログイン方法が残ることを確認する。
13. EmailAddress削除、パスワード削除、専用のGoogle置換操作が画面とURL状態に存在しないことを確認する。
14. Gmail以外のメールアドレスと通常buildでも、状態に応じたGoogle追加または解除へ到達できることを確認する。

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
