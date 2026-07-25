# アーキテクチャ概要

シフトリの処理は、ブラウザ内の画面構成、Convexの関数境界、外部サービス、途中から再開できる非同期処理の四つに分かれる。
機能を調べるときは、変更対象に最も近い入口からコードと機能文書をたどる。

コードと設定が現在の実装の正本である。
配置と依存方向は [`rules/frontend-architecture.md`](rules/frontend-architecture.md)、Convexの設計判断は [`rules/convex-design-strategy.md`](rules/convex-design-strategy.md) を参照する。

```text
browser
  route -> page -> feature -> domain / feature-local logic
    |          query / mutation / action
    v
Convex public function / HTTP route
  -> transactional read or write
  -> operation / fanout / outbox
  -> internal action / cron
  -> Clerk / LINE / Resend / Stripe / Cloudflare

schema widening -> migration runner -> completion verification -> narrowing
```

## 1. フロントエンド境界

URLから業務処理へ向かう依存は、`route -> page -> feature -> domain` の順で流れる。
下位層は上位層をimportせず、認証や店舗境界などの最終判定はConvex側に残す。

| 境界 | 現在の責務 | 代表例 |
|---|---|---|
| `src/routes/` | URL、pathless route group、paramsとsearch、head、redirect | `/`、`_auth.tsx`、`_unregistered.tsx`、`/shifts/reissue` |
| `src/pages/` | route全体のquery、主要entityの成立判定、loadingとerror、featureの構成 | `dashboard/`、`shift-board/`、`staff-shift-submit/`、`home/` |
| `src/components/features/` | 一つの操作またはユースケース、mutationとaction、フォーム、状態遷移 | `Dashboard/`、`ShiftBoard/`、`CreateRecruitmentForm/`、`LandingPage/` |
| `src/components/shared/` | 複数featureで使う、API接続を持たない業務UI | 法務文書表示、フィードバック表示、スタッフ向け案内 |
| `src/components/templates/` | 複数領域を持つページレイアウト | 認証済み画面、公開ページ、スタッフ画面のlayout |
| `src/components/ui/` | 業務知識を持たないUI基盤 | Button、Empty、ErrorBoundary |
| `src/domains/` | ReactとConvex generated typeに依存しない業務型と純粋関数 | `shift/`、`shop/`、`organizationBilling/` |

route groupも責務を分けている。
pathless route groupの`_auth`は`AuthProviders`、認証guard、店舗searchの正規化、認証済みheaderをまとめる。
`_unregistered`はClerkアカウントを持たないスタッフ画面にもConvex接続を提供する。
一方、TOP、FAQ、HowTo、記事、デモなどの公開サイトはこのgroupに入らず、初期表示でClerkとConvexのbundleを必要としない。

pageはroute全体のデータを取得し、featureへ準備済みの値を渡す。
たとえば`DashboardPage`は現在店舗、ユーザー、法務同意状態を購読し、`ShiftBoardRoutePage`は募集単位のシフト表データを取得する。
特定のフォーム送信やDialog内のmutationは、pageではなく対応するfeatureが所有する。

featureから切り離しても同じ業務用語で説明できる判定だけをdomainへ置く。
`src/domains/shop/`は店舗コンテキストと提出方法の純粋な変換を持ち、`src/domains/organizationBilling/`は利用人数上限エラーを画面非依存の回復方法へ変換する。
権限、店舗所属、課金可否、利用人数上限の最終判定はdomainへ移さず、Convexを正とする。

### フロントエンドの逆引き

| 探したい責務 | 最初に読む場所 | 接続先 |
|---|---|---|
| 店舗選択とURLの店舗コンテキスト | `src/domains/shop/context.ts`、`src/components/features/AuthenticatedApp/` | `src/stores/shop/`、`src/hooks/useShopQuery.ts`、`api.dashboard.queries.getMyShops` |
| 店舗の提出方法を編集する純粋処理 | `src/domains/shop/submissionPattern.ts` | `src/components/features/ShopForm/`、`Dashboard/SetupModal/`、`convex/shop/schemas.ts` |
| プラン上限超過後の画面上の回復先 | `src/domains/organizationBilling/peopleCapacity.ts` | スタッフ追加や管理者追加を行う各feature、`convex/organizationBilling/` |
| 募集期間、定休日、締切の入力 | `src/components/features/CreateRecruitmentForm/` | `Dashboard/RecruitmentManagement/`がmutationを接続し、`Demo/ShiftoriDemoFlow/`が登録不要デモとして再利用する |
| 公開TOP | `src/routes/index.tsx` | `src/pages/home/` -> `src/components/features/LandingPage/` -> `PublicPageLayout` |
| 汎用の利用規約とプライバシーポリシー | `src/routes/terms.tsx`、`src/routes/privacy.tsx` | `src/pages/terms/`、`src/pages/privacy/`から管理ユーザー向け文書を既定表示する。対象別routeは`/terms/manager`、`/terms/staff`、`/privacy/manager`、`/privacy/staff` |
| 確定シフト閲覧リンクの再発行 | `src/routes/_unregistered/shifts.reissue.tsx` | `src/pages/staff-shift-reissue/` -> `StaffShiftReissue` -> `api.staffAuth.mutations.requestReissue`。失効した`/shifts/view`から遷移する |

現在の公開サイトは [`features/public-pages.md`](features/public-pages.md)、希望提出と閲覧リンクは [`features/shift-submission.md`](features/shift-submission.md) にまとめている。

## 2. Convex関数境界

Convexはユースケース単位のディレクトリとCQRSを基本にする。
`convex/schema.ts`が保存形式、`convex/{useCase}/`がそのユースケースの関数、`convex/_lib/`が複数ユースケースで使う内部実装を所有する。

| 境界 | 現在の役割 | 主な入口 |
|---|---|---|
| query | DBを読み、Reactの購読または内部処理へ必要最小限のDTOを返す | `convex/{useCase}/queries.ts`、`api.*.queries.*` |
| mutation | 一つのtransactionで検証と保存を行い、必要なら非同期処理の意図をDBへ残す | `convex/{useCase}/mutations.ts`、`api.*.mutations.*` |
| action | Stripe、LINE、Resend、Clerkなど外部APIを呼び、DB操作はqueryまたはmutationへ委譲する | `convex/{useCase}/actions.ts` |
| HTTP Action | ブラウザの公開フォームまたはprovider Webhookを、固定pathで受ける | `convex/http.ts`と各ユースケースの`httpActions.ts`または`webhook.ts` |
| cron | 配送開始、予約漏れ回収、lease回収、retention、日次集計、digestを定期実行する | `convex/crons.ts` |
| migration | schemaの互換期間を保ちながら保存済みdocumentを段階的に移す | `convex/migrations/`、`convex/migrations/index.ts` |

ブラウザから呼べるquery、mutation、actionはインターネットへ公開される。
管理ユーザー向け関数は`convex/_lib/functions.ts`の`authenticatedQuery`、`authenticatedMutation`、`managerQuery`、`managerMutation`を使い、Clerk identity、ユーザー、店舗、グループ所属をサーバー側で解決する。
スタッフ向けの提出と閲覧は、同じファイルのスタッフセッションwrapperがsession token、用途、期限、スタッフと店舗の有効性を検証する。

raw public functionは、Clerk認証を使わないCapability入口や公開プレビューなど、匿名利用が必要な箇所に限られる。
たとえば`staffAuth.mutations.verifyToken`と`requestReissue`は匿名のスタッフ導線から呼ばれるため、rate limitと一様な応答を関数内で持つ。

`convex/http.ts`は、アカウント削除受付、問い合わせ、スタッフ登録、LINE、Resend、StripeのWebhook、内部BI向けqueryを登録する。
各handlerはbody、Origin、署名、service credentialなど、その入口に必要な信頼境界を検証してからinternal functionへ渡す。
個別の安全契約は [`rules/security-strategy.md`](rules/security-strategy.md) と対応する機能文書を参照する。

migrationは`@convex-dev/migrations` componentを`convex/convex.config.ts`でmountし、`convex/migrations/index.ts`の固定順runnerから実行する。
runnerに登録されていることは実環境での完了を意味しないため、deploymentごとの状態はmigration statusで別に確認する。

## 3. 外部サービス境界

外部サービスとの接続は、ブラウザ、HTTP Action、Node actionのどこで信頼を確立するかが異なる。
secretとprovider payloadをフロントエンドの状態や公開responseへ持ち込まない。

| 外部サービス | シフトリ側の入口 | 現在の責務 |
|---|---|---|
| Clerk | `src/providers/AuthProviders.tsx`、`src/providers/ConvexProvider.tsx`、`convex/auth.config.ts` | 認証済みrouteへClerk tokenを渡し、Convexでは`tokenIdentifier`からユーザーを解決する。アカウント削除時のprovider APIは`convex/accountDeletion/`が所有する |
| LINE | `convex/line/actions.ts`、`convex/line/webhook.ts`、`convex/_lib/lineClient.ts` | LINE Loginのcode交換、プロフィールと友だち状態の取得、署名済みWebhook、PushとReply、quota取得を扱う。業務通知の配送はnotification outboxから呼ぶ |
| Resend | `convex/_lib/resend.ts`、`convex/notificationOutbox/actions.ts`、`convex/notificationOutbox/resendWebhook.ts` | 業務メールをidempotency key付きで送信し、署名済みprovider eventを通知履歴とFailure Inboxへ反映する。問い合わせメールは`convex/contact/actions.ts`が同じclientを直接使う |
| Stripe | `convex/organizationStripe/actions.ts`、`convex/organizationStripe/webhook.ts` | Checkout、Portal、プラン変更、既存契約の収束をoperation単位で扱う。Webhookはraw bodyの署名とlivemodeを検証し、受信eventを保存してから処理する |
| Cloudflare | `wrangler.jsonc`、`.github/workflows/deploy.yml`、`src/components/shared/TurnstileWidget/`、`convex/_lib/turnstile.ts` | buildとprerender後の`dist/`をCloudflare Pagesへ配信する。問い合わせとスタッフ登録ではTurnstile tokenのaction、hostname、許可Originをserver-sideで検証する |

公開サイトはCloudflare Pagesで配信される静的HTMLとSPAの組み合わせである。
認証済み画面とスタッフ画面は表示後にConvexへ接続し、公開コンテンツは初期表示にClerkとConvexを要求しない。

外部サービスの設定状態や本番反映済みかどうかは、リポジトリだけでは確定できない。
CI/CDの実行順は [`manual/ci-cd.md`](manual/ci-cd.md)、サービスごとの機能契約は [`features/line-notification.md`](features/line-notification.md)、[`features/notification-outbox.md`](features/notification-outbox.md)、[`features/organization-billing.md`](features/organization-billing.md)、[`features/contact.md`](features/contact.md) を参照する。

## 4. 非同期処理と再開境界

外部送信や多数対象への処理は、最初のscheduler呼び出しだけに完了を依存させない。
再開に必要な対象、cursor、status、dedupe key、leaseをDBへ保存し、cronまたは期限付きの再予約で中断を回収する。

### 通知fanoutとoutbox

```text
募集開始またはシフト確定のmutation
  -> notificationFanoutOperationsへ対象staffを固定
  -> internal actionがbounded batchをclaim
  -> staffごとのnotificationOutboxをdedupe付きでenqueue
  -> cronがoutboxをclaim
  -> LINEまたはResendへ送信
  -> sent / failed / cancelled、またはpendingへ戻す再試行予約と通知履歴を保存
```

fanoutは`convex/notification/fanout.ts`と`convex/notification/mutations.ts`が所有する。
対象スタッフをoperation作成時に固定し、cursorとleaseを使って同じbatchを再開する。
予約漏れと期限切れleaseは`notification-fanout-recover` cronが再予約する。

outboxは`convex/notificationOutbox/`が所有する。
`notification-outbox-drain` cronがdue jobをclaimし、Node actionがLINEまたはResendへ送る。
送信失敗はretry可能性に応じて次回時刻またはFailure Inboxへ移り、provider Webhookによる遅延や拒否も同じ履歴へ合流する。

詳細は [`features/notification-outbox.md`](features/notification-outbox.md) と [`features/notification-failure-dashboard.md`](features/notification-failure-dashboard.md) を参照する。

### Stripe、削除、定期処理

Stripe Webhookは署名検証後に`stripeWebhookEvents`へ保存し、internal actionが処理する。
Stripe operationとWebhook eventの予約漏れや期限切れleaseは`convex/organizationStripe/maintenance.ts`とcronが回収する。

店舗、グループ、アカウントの削除は、受付transactionで利用停止状態とcleanup jobを先に保存する。
`convex/deletionCleanup/`と`convex/accountDeletion/`がbounded batch、lease、recovery cronを使い、外部provider処理を含む長い削除を再開する。
詳細は [`features/data-deletion.md`](features/data-deletion.md) と [`features/account-deletion.md`](features/account-deletion.md) を参照する。

analytics集計、retention、通知失敗の期限切れ、digestも`convex/crons.ts`からinternal functionだけを呼ぶ。
cronの時刻はUTCで登録し、コメントと業務仕様では対応するJST時刻を明示する。

### migration

```text
互換schemaを追加する
  -> 旧形式と新形式を読めるcodeを先に配布する
  -> migrations/index:runを対象deploymentで実行する
  -> componentのstatusと業務上の件数を確認する
  -> 旧形式のfallbackとschema互換を後続変更で外す
```

migrationファイルとrunnerは実行可能な手順を表すが、どのdeploymentで完了したかは表さない。
コード内の`TODO[narrow]:`は、fallbackを外せる完了条件と対象migrationを示す。
