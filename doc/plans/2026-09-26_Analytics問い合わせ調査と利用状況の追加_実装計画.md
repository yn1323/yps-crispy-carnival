# Analyticsの問い合わせ調査と利用状況の追加

> 状態: 追加依頼を含めて実装済み・CIと実環境への反映は未実施
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

### 内部IDの表示（追加依頼）

調査で他の画面やConvex Dashboardと照合できるよう、内部IDを表示する。

| 画面 | 表示するID |
|---|---|
| 店舗詳細 | 店舗ID、組織ID |
| スタッフ詳細 | スタッフID、人物ID、ユーザーID、所属店舗ごとのスタッフID |
| 募集詳細 | 募集ID |
| 通知の検索結果 | 通知ID、組織ID、店舗ID、スタッフID、ユーザーID、募集ID、招待ID |
| 組織の操作履歴 | 操作者のユーザーID、対象ID |

削除済みの対象でも、記録に残っているIDは表示する。  
IDは権限ではなく、閲覧経路の認証と認可は変えない。

### マジックリンク検索（追加依頼）

通知画面で、tokenの完全一致でマジックリンクを1件探す。  
tokenはbearer capabilityのため、URLのqueryに載せず、BFFへの同一originのPOST bodyだけで送る。  
応答にはtokenを含めず、リンクの種類、発行・期限・使用・無効化の日時、店舗・スタッフ・募集、同じ募集の画面の記録、開いたときの判定を返す。

開いたときの判定は、`convex/staffAuth/mutations.ts`の`verifyToken`と同じ順序で、無効化、募集の不整合・削除、スタッフと店舗の利用可否、募集状態、提出期限、閲覧リンクの期限と使用済みを確認する。  
BI側は読み取りだけで、sessionの作成や使用済みへの更新を行わない。  
判定がずれないよう、Convex Function testで実際の`verifyToken`の結果と照合する。

### 絞り込みの導線と店舗一覧の分割取得（追加依頼）

実アプリのtableとindexは変更しない。

- 通知検索に組織名・店舗名の部分一致を追加する。作成時刻のindexで読んだ候補を、要求内でcacheした現在の店舗名・組織名で照合する。削除済みの店舗・組織の名称では一致させない。
- 日次分析の契約状況カードから、同じ区分の契約の組織に属する店舗だけを店舗一覧で開く。区分はトライアル中、有料プラン（Standard・Pro）、Free、無償、支払い・切替の手続き中、プラン変更の予定、支払い失敗・停止処理中とする。
- 日別推移の期間内の店舗数から、期間内に実績がある店舗の内訳を開く。同じ店舗の行が日数分あるため、店舗tableを順に読み、`analyticsShopDays`の店舗×日付indexで期間内に実績がある店舗だけを1回返す。店舗は論理削除だけのため、削除済み店舗も匿名表示で含める。1日だけの内訳は従来どおり日付indexで読む。計測開始後の日がすべて現在の定義で集計済みの場合だけ返す。グラフの日付を押すと、その日の内訳を開く。
- 店舗一覧は全ページの一括取得をやめ、20店舗ずつのページを「続きを見る」で読む。契約と要注意の絞り込みはサーバー側で行い、一致しない店舗ではスタッフ数を数えない。並べ替えは読み込んだ店舗の中だけで行う。

入力は既存の固定request schemaに追加し、検索語は100文字まで、期間は最大90日、実績の内訳と契約・要注意の絞り込みは併用させない。  
新しい個人情報の返却、ログ、状態変更はない。

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

マジックリンク検索では次を追加する。

- Actor / Trust boundary: 既存と同じ本人認証済みの運用者だけ。BFFのPOST routeで同一originとJSON bodyを必須にする。
- Asset: 提出・閲覧用のtoken、staff session token。
- Abuse case: tokenがURL、ブラウザ履歴、Cloudflareやアプリのログ、React Queryのcacheに残ること。
- Server-side enforcement: GETの問い合わせ入力ではmagic link検索を受け付けない。tokenとsession tokenを応答へ含めない。
- Rate limit: 既存のservice rate limitを使う。状態は変更しない。
- Logs / PII: BFFとHTTP Actionはendpoint名だけを記録し、request bodyを記録しない。画面はtokenをURLとcacheへ保存しない。
- Regression test: 応答にtokenとsession tokenが含まれないこと、GET経由の入力拒否、`verifyToken`との判定一致を確認する。

## 検証

- `pnpm lint`、`pnpm type-check`、`pnpm test:convex`、`vitest run --project=logic`
- `pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`

2026-09-26に、上記はすべてローカルで成功した。  
絞り込みの導線と店舗一覧の分割取得の追加後も、`pnpm lint`、`pnpm type-check`、`convex/analyticsDashboard`と`convex/_scenario/analyticsNightly.test.ts`のテスト、`pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`が成功した。  
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
- `convex/_scenario/analyticsNightly.test.ts`、`convex/analyticsDashboard/investigationQueries.ts`
- `doc/features/analytics-dashboard.md`、`doc/rules/security-strategy.md`
