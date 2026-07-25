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

過去の監査台帳に記載された`scripts/githubWorkflowSecurity.test.ts`は現行リポジトリに存在しない。
GitHub Actionsの権限、trigger、Environment gate、artifactの信頼境界は、`.github/workflows/`の実装と実行履歴を組み合わせて確認する。

リポジトリ検証の成功を、production設定やdeploy済みartifactの証明として扱わない。

## 実環境の確認項目

| Test ID | 対象 | 完了条件 |
|---|---|---|
| `ENV-BI-01` | Cloudflare Access | 未認証の別browser contextからHTMLとAPIの両方がWorker到達前に拒否される |
| `ENV-BI-02` | Worker body上限 | Content-Lengthなしの16 KiB超過requestが全量読取前に413となり、Convex callが0件になる |
| `ENV-BI-03` | Analytics容量 | 最大想定店舗数でread量、実行時間、応答size、page上限を記録する |
| `ENV-CI-01` | GitHub Actions公開境界 | 対象branch、trigger、fork制約、最小permissions、Environment gate、同じworkflowで検証したartifactだけを公開する契約が実行履歴と一致する |
| `ENV-REL-01` | Production release | canary head、merge SHA、tree SHA、tag、Convex、Cloudflare metadataが同じreleaseを示す |
| `ENV-STRIPE-01` | Stripe sandbox | 通常、3DS成功、3DS失敗、高risk、Trial SetupIntent、Portal、実Webhookをtest値で確認する |
| `ENV-STRIPE-02` | Stripe設定 | 公開文書で申告するRadar、3DS、card testing対策と実account設定が一致する |
| `ENV-REG-01` | 公開スタッフ登録 | 本番Turnstile、許可Origin、8 KiB超過拒否をdeployed canaryで確認する |
| `ENV-CLERK-01` | Clerk | MFA、lockout、server throttle、loginまたはaccount変更通知を負の試験で確認する |
| `ENV-OPS-01` | 端末と診断 | EDR、signature更新、full scan、隔離、credential rotation、DASTまたは第三者診断を記録する |

IP由来の制限を有効にする場合は、ingressが利用者指定headerを破棄し、信頼できる値へ上書きする証跡を先に確認する。
確認できないheaderを、認証や単独の許可条件に使わない。

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
- `doc/features/notification-outbox.md`
- `.github/AGENTS.md`
- `convex/AGENTS.md`
