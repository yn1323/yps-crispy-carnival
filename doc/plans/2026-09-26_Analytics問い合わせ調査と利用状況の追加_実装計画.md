# Analyticsの問い合わせ調査と利用状況の追加

> 状態: 実装済み・CIと実環境への反映は未実施
>
> 作成日: 2026-09-26

内部Analyticsへ、既存ユーザーの動向と問い合わせ調査に使う画面を追加する。  
対象は、要注意の店舗、契約状態、通知の状態と検索、スタッフの行動履歴、組織の操作履歴である。

## 合意した前提と範囲

分析用テーブル以外の実アプリ用schemaは追加・変更しない。  
`notificationOutbox`へのindex追加も行わず、既存indexと有界な読み取りだけで実装する。

スタッフのリンクアクセスなど、今記録していない操作は新たに記録しない。  
過去データのbackfillも行わない。  
画面は既存データから分かる事実だけを表示し、記録がないことを未操作とは断定しない。

| 対象 | 今回の扱い |
|---|---|
| 要注意の店舗 | 実装する |
| 契約状態 | 実装する |
| 通知の状態とOutbox検索 | 実装する |
| スタッフの行動履歴 | 既存データを時系列に並べる |
| 管理者の操作履歴 | 組織単位の監査ログだけを表示する |
| 利用店舗数の合算 | 既存の日次3指標で足りるため追加しない |
| 新規店舗の到達段階 | GA4で扱うため追加しない |
| スタッフ操作の新規記録 | 追加しない |

## 画面と定義

### 要注意の店舗

店舗一覧に「最終利用日」と「契約」の列、要注意の理由を追加する。  
一覧を要注意の店舗だけに絞る切り替えも追加する。

| 理由 | 条件 | 元データ |
|---|---|---|
| 次のシフトがない | 最新の募集期間の終了日が今日（JST）より前 | `recruitments` の現在値 |
| 14日以上利用がない | 最後に提出・確定があった日が14日以上前 | `analyticsShopDays` |

最終利用日は、計測開始後に記録した提出・確定の最終日である。  
記録がない店舗を「利用なし」の理由では要注意に含めない。

### 契約状態

組織の`organizationBillingStates`を、店舗一覧・店舗詳細に表示する。  
日次分析には、現在の契約状態ごとの組織数と、7日以内にトライアルが終わる組織数を表示する。  
Stripeの識別子は返さない。

### 通知の状態と検索

ナビゲーションに「通知」を追加する。  
上部に通知の状態、下部に検索を置く。

| 通知の状態 | 元データ |
|---|---|
| 今月の送信数（メール・LINE） | `notificationUsage`（店舗宛のみ） |
| 直近7日の送信失敗 | `notificationOutbox`の`by_status_failedAt` |
| 送信が遅れている通知 | 予定時刻から15分以上過ぎた送信待ち、lease期限切れの送信中 |
| LINEの送信枠 | `lineQuotaStatus` |

検索条件は、期間（JST、既定7日、最大90日）、店舗、状態、チャネル、種別である。  
通知IDまたはResendのメールIDの完全一致でも検索できる。

店舗を指定した検索は`by_shopId_status`を状態ごとに読み、作成時刻の新しい順に統合する。  
店舗を指定しない検索は`by_creation_time`を期間で絞る。  
一回に読む行数は上限を設け、条件に合わない行は読み取り後に除く。  
続きは作成時刻を境界にしたcursorで取得する。

### スタッフの行動履歴

スタッフ詳細に、次の既存データを時刻順に並べた履歴を追加する。

| 出来事 | 元データ | 注意 |
|---|---|---|
| スタッフ登録、参加申請、承認・却下 | `staffs`、`staffRegistrationRequests` | 申請はメールアドレスで照合 |
| 規約同意、同意依頼リンクの発行・使用 | `legalConsentEvents`、`legalConsentTokens` | |
| 提出リンク・閲覧リンクの発行、閲覧リンクの初回利用 | `magicLinks` | 提出リンクの利用日時は記録がない |
| 提出画面・閲覧画面を開いた | `sessions` | 期限切れのsessionは削除済みのため、有効中だけ |
| 初回提出、最終提出 | `shiftSubmissions` | 途中の再提出は記録がない |
| LINE連携リンクの発行・使用、連携・解除、友だち解除 | `lineLinkTokens`、`organizationPersonLineLinks`、`lineProviderUsers` | |
| 通知の受付 | `notificationHistory` | |
| 要望の送信 | `featureRequests` | 本文は要望タブで確認 |

### 組織の操作履歴

店舗詳細に、所属組織の`organizationAuditEvents`を新しい順に表示する。  
操作者、対象、状態の変化を表示し、同じ組織の全店舗で共通の履歴であることを明記する。

## Security Lens

- Actor: Cloudflare Accessで本人認証した運用者だけ。BFFがservice secretでConvex HTTP Actionを呼ぶ。
- Asset: 通知の宛先・本文・capability URL、LINE user ID、メールアドレス、token。
- Trust boundary: Browser → Worker BFF → Convex HTTP Action → internal query。
- Abuse case: credential漏洩時の個人情報の一括取得、capability URLの再利用、URLやログへの個人情報混入。
- Server-side enforcement: 固定request schema、ID形式と期間の検証、internal queryの最小DTO。Outboxのpayload、dedupeKey、lease、provider生エラー、各種tokenは返さない。
- Rate limit / idempotency: 既存のservice rate limitを使う。閲覧専用で状態を変更しない。
- Lifecycle / recovery: 削除済みの店舗・スタッフ・募集は削除済みとして表示し、詳細へのリンクを出さない。redact済みの通知はredact済みと表示する。
- Logs / PII: 新しいログは追加しない。メールアドレスは検索条件にせず、URLへ個人情報を載せない。
- Regression test: Convex Function testで、通知DTOと行動履歴に宛先・本文・tokenが含まれないこと、入力検証、店舗境界を確認する。

## 検証

- `pnpm lint`、`pnpm type-check`、`pnpm test:convex`、`vitest run --project=logic`
- `pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`

2026-09-26に、上記はすべてローカルで成功した。  
本体UIは変更していないため、`ui` projectのテストは実行していない。  
CI、自動レビュー、実環境への反映と実データでの表示確認は未実施である。

## 参照したファイル

- `convex/analyticsDashboard/queries.ts`、`convex/analyticsDashboard/queryHelpers.ts`、`convex/analyticsDashboard/schemas.ts`
- `convex/analyticsDashboard/dto.ts`、`convex/analyticsDashboard/validators.ts`、`convex/analyticsDashboard/httpActions.ts`
- `convex/schema.ts`、`convex/organization/audit.ts`、`convex/organization/validators.ts`
- `convex/notificationOutbox/schemas.ts`、`convex/notificationOutbox/safeError.ts`、`convex/notificationOutbox/redaction.ts`
- `convex/notificationOutbox/failureResend.ts`、`convex/notificationOutbox/shopManagerNotification.ts`
- `convex/staffAuth/mutations.ts`、`convex/notification/actions.ts`
- `apps/analytics-dashboard/src/`、`apps/analytics-dashboard/AGENTS.md`
- `doc/features/analytics-dashboard.md`、`doc/rules/security-strategy.md`
