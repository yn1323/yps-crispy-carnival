# 分析KPI可視化アプリ

本人認証付きのCloudflare URLで、毎日の利用状況と問い合わせ対象の現在情報を確認する内部Dashboardです。  
顧客向け本体とは別のWorkerとStatic Assetsで配信します。日次集計が始まる前でも、店舗・スタッフ・要望を閲覧できます。

実環境での公開状況は[リリース状態](../manual/release-status.md)を参照してください。

## 画面

ナビゲーションは「日次」「店舗」「要望」の3つです。

| route | 用途 |
|---|---|
| `/` | 前日の登録・提出・確定店舗数、7日・30日・90日の推移と日別表 |
| `/shops` | 現在の店舗一覧、名称検索、日別指標からの店舗内訳 |
| `/shops/:shopId` | 現在の店舗情報、スタッフ一覧、募集一覧、計測開始後の活動 |
| `/shops/:shopId/staff/:staffId` | スタッフ情報、所属、提出履歴、通知の状態 |
| `/shops/:shopId/cycles/:recruitmentId` | 募集の現在状態と提出状況、観測済みの確定時刻 |
| `/requests` | 要望一覧、削除扱いのチェックと取り消し |

日次の大きな3数値は前日分です。期間選択は推移と期間内の重複を除いた店舗数に適用します。  
URLは相対期間を持ち、翌日開くと対象日も進みます。前日が未集計でも終了日を過去へずらしません。

0、計測開始前、初日の部分計測、未集計、実行中、失敗を区別します。  
欠損はグラフの0にせず、期間内店舗数も未確定にします。集計に失敗した日があっても、成功した他の日と問い合わせ画面は閲覧できます。

日別の数値から、その実績に含まれる店舗へ移動できます。過去の活動と現在の店舗名は基準時点を区別します。  
削除された対象は削除済みと表示し、現在の詳細へのリンクを出しません。保持期限外の内訳を現在値から推定しません。

## 問い合わせと要望

店舗・スタッフ・募集の現在情報はcanonicalな業務tableを有界pageで読みます。  
日次snapshotのための初期化やseedは不要です。スタッフ名は一覧、メールアドレスはスタッフ詳細に限定します。組織・店舗・人物・所属の一致と削除状態を確認してから返します。

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
| `GET` | `/api/requests` | 要望一覧 |
| `POST` | `/api/requests/update` | 指定した要望の`isDeleted`だけを更新 |

更新は同一originとJSON bodyを必須にします。反転操作ではなく明示的なbooleanを送り、同じ要求を再送しても状態が反転しないようにします。  
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
- `apps/analytics-dashboard/src/server/analyticsRoutes.ts`、`apps/analytics-dashboard/src/server/analyticsProxy.ts`
- `convex/analyticsDashboard/queries.ts`、`convex/analyticsDashboard/mutations.ts`
- `convex/analyticsDashboard/httpActions.ts`、`convex/analyticsDashboard/schemas.ts`
- [分析KPI蓄積基盤](analytics.md)、[要望受付](feature-requests.md)、[Analytics運用](../manual/analytics-rollout.md)
