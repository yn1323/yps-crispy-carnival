# 分析KPI可視化アプリ

本人認証付きのCloudflare URLで、毎日の利用状況と問い合わせ対象の現在情報を確認する内部Dashboardです。  
顧客向け本体とは別のWorkerとStatic Assetsで配信します。日次集計が始まる前でも、店舗・スタッフ・通知・要望を閲覧できます。

実環境での公開状況は[リリース状態](../manual/release-status.md)を参照してください。

## 画面

ナビゲーションは「日次」「店舗」「通知」「要望」の4つです。

| route | 用途 |
|---|---|
| `/` | 前日の登録・提出・確定店舗数、7日・30日・90日の推移と日別表、契約状態ごとの組織数 |
| `/shops` | 現在の店舗一覧、契約・スタッフ数・直近シフト・最終利用日、要注意の店舗、名称検索、列ごとの並べ替え、日別指標からの店舗内訳 |
| `/shops/:shopId` | 現在の店舗情報と契約、スタッフ一覧、募集一覧、計測開始後の活動、組織の操作履歴 |
| `/shops/:shopId/staff/:staffId` | スタッフ情報、所属、行動の履歴、提出履歴、通知の状態 |
| `/shops/:shopId/cycles/:recruitmentId` | 募集の現在状態と提出状況、観測済みの確定時刻 |
| `/notifications` | 通知の状態、期間・店舗・状態・送信方法・種別またはIDによる通知の検索、tokenによるマジックリンクの確認 |
| `/requests` | 要望一覧、削除扱いのチェックと取り消し |

日次の大きな3数値は前日分です。期間選択は推移と期間内の重複を除いた店舗数に適用します。  
URLは相対期間を持ち、翌日開くと対象日も進みます。前日が未集計でも終了日を過去へずらしません。

0、計測開始前、初日の部分計測、未集計、実行中、失敗を区別します。  
欠損はグラフの0にせず、期間内店舗数も未確定にします。集計に失敗した日があっても、成功した他の日と問い合わせ画面は閲覧できます。

日別の数値から、その実績に含まれる店舗へ移動できます。過去の活動と現在の店舗名は基準時点を区別します。  
削除された対象は削除済みと表示し、現在の詳細へのリンクを出しません。保持期限外の内訳を現在値から推定しません。

## 要注意の店舗と契約状態

店舗一覧は、最新の募集期間が終わって次の募集がない店舗と、最後の提出・確定から14日以上たった店舗を要注意として示します。  
最終利用日は計測開始後に記録した提出・確定の最終日です。記録がない店舗を「利用なし」の理由では要注意に含めません。

契約は組織の現在の課金状態を表示し、トライアル終了日や変更予定日を添えます。  
日次分析には、削除済みを除く組織の契約状態ごとの数と、7日以内にトライアルが終わる組織数を表示します。Stripeの識別子は返しません。

## 通知の状態と検索

通知画面の上部には、今月の店舗宛の送信数、直近7日の送信失敗、予定から15分以上遅れた送信待ちと処理が止まった送信中、LINEの送信枠を表示します。  
件数は上限で打ち切り、上限に達した場合は「以上」と表示します。

検索は受付日時の新しい順に、JSTで最大90日の期間を対象にします。  
店舗、状態、送信方法、種別で絞り込めます。店舗の絞り込みは店舗詳細から開きます。通知IDまたはResendのメールIDでは、他の条件なしで1件を探せます。  
一回に読む行数には上限があり、条件に合う行が少ない場合は続きを数回まで自動で読みます。

一覧には、店舗、組織、宛先の人物名、関連する募集、状態、安全なエラー分類、取消理由、送信・到達・失敗・取消の日時を表示します。  
宛先のメールアドレス、LINE user ID、本文、capability URL、dedupeKey、lease、providerの生エラーは返しません。保存期間後に宛先・本文を削除した通知は、その旨を表示します。  
メールアドレスでは検索しません。

### マジックリンクの確認

通知画面で、スタッフに届いたリンクのtokenを入力すると、そのマジックリンクを1件表示します。  
tokenは同一originのPOST bodyだけで送り、URL、React Queryのcache、ログへ残しません。応答にもtokenとsession tokenを含めません。

表示するのは、リンクの種類、発行日時、開ける期限、閲覧リンクの初回使用、無効化の日時、店舗・スタッフ・募集、同じ募集で有効期限内の画面の記録です。  
開けるかどうかは、スタッフ用の`verifyToken`と同じ順序で判定し、理由を表示します。調べてもsessionの作成や使用済みへの更新はしません。

## 内部ID

店舗詳細は店舗IDと組織ID、スタッフ詳細はスタッフID・人物ID・ユーザーIDと所属店舗ごとのスタッフID、募集詳細は募集IDを表示します。  
通知の検索結果は通知・組織・店舗・スタッフ・ユーザー・募集・招待のIDとResendのメールID、組織の操作履歴は操作者のユーザーIDと対象IDを表示します。  
削除済みの対象でも、記録に残っているIDは表示します。IDは照合用であり、閲覧の認証と認可は変えません。

## 行動の履歴

スタッフ詳細の行動の履歴は、既存の記録を時刻順に並べます。  
対象は、スタッフ登録、参加申請と審査、規約同意と同意リンク、提出リンク・閲覧リンクの発行、閲覧リンクの初回利用、有効中の画面、初回・最終提出、LINE連携、通知の受付、要望の送信です。  
提出リンクを開いた記録、途中の再提出、LINEの既読、期限切れで削除された画面の記録は残っていないため表示しません。tokenとメールアドレスは返しません。

店舗詳細の組織の操作履歴は、組織の監査ログを新しい順に表示します。  
操作者と対象は現在の人物名・店舗名・招待名で表示し、変更前後の値は組織名と契約状態の変化だけに限ります。

## 問い合わせと要望

店舗・スタッフ・募集の現在情報はcanonicalな業務tableを有界pageで読みます。  
日次snapshotのための初期化やseedは不要です。スタッフ名は一覧、メールアドレスはスタッフ詳細に限定します。組織・店舗・人物・所属の一致と削除状態を確認してから返します。

店舗一覧は対象店舗をすべて取得し、直近シフトの開始日が新しい順に並べてから50件ずつ表示します。  
直近シフトは削除されていない募集から選び、未確定・未来の期間も含めて`2026/9/1-9/15`の形式で表示します。シフトがない店舗は末尾です。
各列の見出しで昇順・降順を切り替えられ、スマートフォンでは並べ替える項目と順序を選べます。

スタッフ数は現在有効な所属を数え、管理者とシフト対象外のスタッフも含めます。  
削除済み・所属不整合のスタッフは除外し、走査上限を超えて人数を確定できない店舗は「確認できません」と表示します。

提出一覧は現在取得できる履歴です。記録がないことだけから過去の未提出を断定しません。  
期限時点の対象者集合がない提出率は算出不能とし、現在の対象者数で補完しません。通知の送信状態を本人の到達・既読として表示しません。

要望タブはAnalytics runから独立しています。チェックを付けると`isDeleted: true`、外すと`false`を保存します。  
削除扱いの要望も一覧に残し、本文に打ち消し線を付けます。保存中は同じ行の操作を止め、成功時は取得済みの一覧pageへ反映します。通信失敗時は再取得して保存状態を確認します。

## APIと認証境界

```text
Browser → Cloudflare Access → Worker BFF → Convex HTTP Action → internal query / 要望専用mutation
```

ブラウザは同一originの固定endpointだけを呼びます。service credentialはサーバー側に保持します。  
Convex HTTP Actionはcredential、固定request schema、bodyとresponseの大きさ、rate limitを検証します。任意function名やfield式は受け取りません。

| method | BFF path | 用途 |
|---|---|---|
| `GET` | `/api/analytics/overview` | 日次指標と固定期間の推移 |
| `GET` | `/api/analytics/shops` | 店舗一覧または日別の内訳 |
| `GET` | `/api/analytics/shops/:shopId` | 店舗詳細 |
| `GET` | `/api/analytics/shops/:shopId/staff/:staffId` | スタッフ詳細 |
| `GET` | `/api/analytics/shops/:shopId/cycles/:recruitmentId` | 募集詳細 |
| `GET` | `/api/analytics/shops/:shopId/staff/:staffId/timeline` | スタッフの行動の履歴 |
| `GET` | `/api/analytics/shops/:shopId/organization-events` | 所属組織の操作履歴 |
| `GET` | `/api/analytics/notifications` | 通知の検索 |
| `GET` | `/api/analytics/notifications/summary` | 通知の状態 |
| `GET` | `/api/requests` | 要望一覧 |
| `POST` | `/api/analytics/magic-links/lookup` | tokenによるマジックリンクの確認。状態は変更しない |
| `POST` | `/api/requests/update` | 指定した要望の`isDeleted`だけを更新 |

POSTの2つは同一originとJSON bodyを必須にします。反転操作ではなく明示的なbooleanを送り、同じ要求を再送しても状態が反転しないようにします。  
店舗、スタッフ、募集などの業務データを変更するAPIは設けません。

ブラウザに永続cacheを作らず、認証切れやCloudflareログインへの転送時は取得済みデータを破棄します。  
スタッフ名、メールアドレス、要望本文、credential、providerの生errorはlogへ出しません。

JSONL出力は表示対象期間の日次集計とmetadataだけです。店舗ID、氏名、メールアドレス、要望は含めず、外部AIへ自動送信しません。

## 配信と検証

既存Cloudflare配信とAccess設定を継続します。WorkerとローカルViteは同じBFF処理を使います。  
接続先とservice credentialの設定はサーバー側に置きます。日次集計の開始用環境変数は不要です。

このアプリは本体UIのFull Regression対象に含めません。専用lint・type-check・buildをCIで実行し、認証、対象境界、DTO、要望更新はConvex Function / HTTP Function testsで検証します。

## 関連ファイル

- `apps/analytics-dashboard/src/pages/`、`apps/analytics-dashboard/src/features/requests/`
- `apps/analytics-dashboard/src/features/notifications/`、`apps/analytics-dashboard/src/features/activity/`
- `apps/analytics-dashboard/src/server/analyticsRoutes.ts`、`apps/analytics-dashboard/src/server/analyticsProxy.ts`
- `convex/analyticsDashboard/queries.ts`、`convex/analyticsDashboard/investigationQueries.ts`、`convex/analyticsDashboard/mutations.ts`
- `convex/analyticsDashboard/httpActions.ts`、`convex/analyticsDashboard/schemas.ts`、`convex/analyticsDashboard/notificationCategories.ts`
- [分析KPI蓄積基盤](analytics.md)、[要望受付](feature-requests.md)、[Analytics運用](../manual/analytics-rollout.md)
