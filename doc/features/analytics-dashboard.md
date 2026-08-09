# 分析KPI可視化アプリ

分析projectionと日次snapshotを、内部担当者だけが閲覧する分離Dashboardです。  
サービス全体からグループ、店舗、シフト周期へ移動し、導入到達度と要確認状態を別々に確認できます。

顧客向け本体アプリとは別のCloudflare WorkerとStatic Assetsで配信します。  
実環境での公開状態は[リリース状態](../manual/release-status.md)を参照してください。

## 画面

stage別tabは使わず、分析対象ごとにrouteを分けます。

| route | 用途 |
|---|---|
| `/` | 要確認店舗、現在の利用状況、KPI推移、導入到達度、要確認状態、詳細分析 |
| `/organizations` | グループの利用状況と要確認状態の比較、並び替え、絞り込み、pagination |
| `/organizations/:organizationId` | グループの主要値、人員内訳、多店舗展開、所属店舗、KPI推移 |
| `/shops` | 店舗の導入到達、次回シフト、提出率、要確認状態の比較、pagination |
| `/shops/:shopId` | 店舗の現在値、導入到達履歴、要確認状態、KPI推移、シフト周期一覧 |
| `/shops/:shopId/cycles/:recruitmentId` | 一つのシフト周期の提出、通知、確定、集計状態 |
| `/requests` | Analytics runと分けた要望一覧 |

期間、集計単位、filter、sort、cursorはURL query parameterへ保存します。  
行を選ぶと詳細routeへ遷移し、戻る操作と共有URLで分析状態を再現できます。

URLに`from`と`to`がない初回表示では、responseの`dataStartDate`と`latestCompleteSnapshotDate`を使って期間を補正します。  
開始日は蓄積開始日より前へ広げず、同じ長さの直前期間がすべて蓄積範囲へ収まる場合だけ比較期間を設定します。  
URLに`from`と`to`がある場合は、蓄積開始前を含んでいても指定を保持します。

画面には、そのrouteのresponseへ反映される条件だけを表示します。  
一覧画面では比較期間と集計単位を表示せず、店舗詳細の周期集計状態は周期一覧内で指定します。  
適用中の条件を一行で示し、入力欄は「条件を変更」を選んだ場合だけ開きます。

サマリーは要確認店舗を最初に表示し、グループ比較表を初期表示しません。  
segment比較は「詳細分析」を開いた場合だけ取得し、一度に一つの比較軸を表示します。  
グループ一覧と店舗一覧への導線はサマリー末尾に残します。

数値と表を正確な値の正本として残し、比較、推移、段階、分布を把握する箇所にはグラフを併記します。
グラフは`Recharts`と`@chakra-ui/charts`で描画し、独自実装の棒や比率バーを表内へ配置しません。
サマリーでは、関連KPIを横棒、店舗の稼働構成をドーナツ、日別推移を折れ線、導入到達段階をファネル、要確認状態を横棒で表示します。

詳細分析では、区分別の全店舗数と2回目確定店舗数を集合横棒、3つの運用KPIを0〜100%の集合横棒、要確認状態の区分内該当率をヒートマップで表示します。
2回目確定店舗数の分母には全店舗数ではなく、切替後に登録されて導入到達度を観測できる店舗数を使います。
選択した比較軸がプラン、LINE利用、通常周期、最近の提出傾向の場合は、区分が互いに重ならないため店舗構成をドーナツでも表示します。
各グラフの後に表を残し、個別の正確な値を確認できるようにします。

グループ一覧は6列、店舗一覧は最大7列で主要情報を比較します。  
デスクトップでは表、モバイルでは対象名、要確認状態、主要値、詳細導線を縦に並べたカードを表示します。  
最大50行を表示する一覧表にはグラフを埋め込まず、数値比較と詳細対象の選択へ役割を絞ります。
単独の日時、ID、個別状態、比較対象のない一つの値もグラフ化しません。
現在の接続環境を示す`env.label`は、各ページ本文ではなく共通headerへ表示します。

サマリーの`データを書き出す`では、現在適用中の期間、比較期間、集計単位、グループ・店舗scope、segmentの比較軸を固定し、全pageを一つのJSON Linesファイルへまとめてローカル保存します。  
全体KPI、全trend指標、milestone、health、segment、グループ、店舗、店舗別推移、cycleを含みます。  
途中pageの取得失敗、出力中のsnapshot更新、安全上限の超過時は、欠けたJSONLを保存せずerrorとして表示します。

JSONLは先頭行をmanifest、以降を`recordType`付きの1行1recordとし、AIが行単位で分割して読める形にします。  
関連recordは`organizationId`、`shopId`、`recruitmentId`で結合します。  
グループまたは店舗scopeでは、scope非対応のsegmentを混在させず、非出力理由をrecordに残します。  
グループと店舗は`organizationId`、`shopId`で識別し、グループ名と店舗名は除外します。  
スタッフ氏名、email、電話番号、LINE user ID、シフト提出内容、通知本文、要望一覧・要望本文、service credentialも含めません。  
Dashboardから外部AIへ自動送信せず、保存後のファイルをどこへ渡すかは利用者が判断します。

## 表示状態

`/requests`を除くAnalytics routeでは、`availability`、`asOf`、`dataStartDate`、`latestCompleteSnapshotDate`、`computedAt`、警告を表示します。
通常時は最新の完全な集計日と集計完了日時を一行で示し、蓄積開始日と基準日時は「集計の詳細」に収めます。  
期間を変えると解消できる警告は表示条件の近くへ置き、resetまたは日次runの実行中・失敗はページ上部へ表示します。
reset完了日の初回partialも通常の`complete`日次として期間集計と比較へ含め、専用の注記や警告は表示しません。
`/requests`はAnalytics runの状態を画面表示せず、現在の要望を独立した一覧として表示します。

| 状態 | 表示 |
|---|---|
| 正確な0 | `0`または`0%` |
| completeな日次runがない | 分析データを利用できません |
| resetまたは最新日次runが実行中・失敗 | ページ上部に利用不可の理由を表示し、途中行を返さない |
| 過去の分母を復元不能 | 該当する指標だけ「算出できません」 |
| 選択期間に失敗日または未起動日がある | 欠損日の警告を表示し、期間集計を算出しない |
| filter結果が0件 | 条件に一致するデータなし |
| 現在のraw pageに一致せず次cursorあり | このページには一致なし。次の候補あり |
| API失敗 | 取得失敗。0へ置換しない |

後の日次runが成功すると、直前の失敗日を埋めずに`available`へ戻ります。
cronが起動せず新しいrunが存在しない場合は、最後の成功値と`asOf`を表示し、起動漏れは外部監視へ委ねます。

`unavailable`な率と欠損日をrankingへ含めません。
行の状態が`complete`の場合はbadgeを表示せず、`unavailable`の場合だけ行内へ集計状態を表示します。

ページ全体の集計状態、行の集計状態、個別指標の計算可否は、同じbadge列へまとめません。

サマリーの率は選択期間全体の完全性に従い、集計対象となる完全なシフト周期がない場合はその理由を表示します。
稼働店舗数と到達度対象店舗数は選択期間内の最新snapshot自身が完全なら現在値を表示し、比較期間が蓄積開始日前でも現在値まで`unavailable`にはしません。
比較期間が成立しない場合は、各KPIカードへ比較不能を反復表示しません。

推移は、いずれかの指標に描画できる値が1点以上ある場合にグラフを表示します。

1日分だけでも描画可能な値がある場合は点または一本の棒として表示し、2日分以上で推移を確認できるようにします。

分母が0または値が欠損している場合は0へ置換せず、描画可能な値が一つもない場合だけグラフを省略します。

グループ詳細は主要値と人員内訳を分け、人員内訳を初期状態で閉じます。  
全店舗を稼働中と非稼働へ分けたドーナツ、要確認状態の横棒、多店舗展開に要した時間の横棒をKPIカードと併記します。
所属店舗が1店舗の場合は多店舗展開の「算出できません」カードを並べず、2店舗目の登録後に表示することを案内します。

店舗詳細は現在の要確認状態、導入到達履歴、次回シフトを先に表示します。  
累積シフト周期が正確に0の場合は、推移、累積KPI、期間KPI、周期一覧を一つの空状態へ縮退します。  
周期がある場合も累積KPIの補助値は開閉領域へ置き、期間内に提出率の対象人数がいない場合は`0 / 0`カードを並べません。  
シフト対象者のLINE連携済みと未連携は、合計がシフト対象人数と一致する場合だけドーナツで表示します。
スタッフ所属とシフト対象、周期の確定段階、累積・期間提出率、累積通知、確定時間を、対応するKPIカードと同じ尺度の横棒で比較します。
表示中の集計済み周期が2件以上ある場合は、周期別の提出率を折れ線、通知件数を集合縦棒で周期一覧の前へ併記します。
店舗本体は周期一覧の取得完了を待たずに表示し、周期一覧のloadingとAPI失敗は周期section内だけで扱います。

シフト周期詳細は個人名を表示せず、必要な場合だけopaque ID、提出有無、初回提出時刻、通知結果を扱います。
期限時点と周期終了時点の提出済み・未提出、通知の送信成功・最終失敗はドーナツで表示します。
催促件数は送信成功の内訳なので通知結果の円へ含めず、正確な値をKPIカードで表示します。
作成と確定に要した時間は横棒で比較します。

グラフはcompleteな日次runに属する値だけを描画し、`unavailable`と欠損値を0へ置換しません。
ドーナツの補集合は、内数が分母以下で合計が全体になる場合だけ算出します。
要確認状態は一店舗に複数成立するため円グラフや積み上げグラフを使わず、独立した棒として表示します。
paginationされた一覧を表示中pageだけで全体rankingに見せず、周期別グラフは「表示中の周期」の範囲であることを明記します。

## API境界

```text
Browser -> Cloudflare Access -> Worker BFF -> Convex HTTP Action -> internal Analytics query
```

ブラウザは同一originの固定GET endpointだけを呼びます。  
Workerのservice credentialとConvex URLはサーバー側環境変数に置き、ブラウザへ返しません。
Workerはrequestを検証し、固定されたConvex route `POST /analytics-dashboard/query` へ転送します。

ローカル開発では次のサーバー側環境変数を使います。

| 変数 | 用途 |
|---|---|
| `VITE_CONVEX_URL` | Convex client URL。local deploymentの既定値は`http://127.0.0.1:3210` |
| `VITE_CONVEX_SITE_URL` | HTTP Action URL。local deploymentでは`http://127.0.0.1:3211`を明示する |
| `SHIFTORI_INTERNAL_API_SECRET` | BFFとConvex HTTP Actionの共有secret。`VITE_`を付けず、browser bundleへ公開しない |
| `ANALYTICS_ENV_LABEL` | 任意の画面表示用ラベル。未設定時は接続URLからlocalまたはdevelopment deploymentを判定する |

`VITE_CONVEX_URL`だけをlocalの`3210`へ向けても、HTTP Actionのportは解決できません。`VITE_CONVEX_SITE_URL`も`3211`へ向け、同じ`SHIFTORI_INTERNAL_API_SECRET`をVite serverとlocal Convexの両方へ設定します。

| method | Worker BFF path | 主なresponse |
|---|---|---|
| `GET` | `/api/analytics/overview` | 全体KPIと最新完全日 |
| `GET` | `/api/analytics/trends` | 日、週、月のKPI推移 |
| `GET` | `/api/analytics/milestones` | 導入到達数と転換 |
| `GET` | `/api/analytics/health` | health signal別店舗数 |
| `GET` | `/api/analytics/organizations` | グループ一覧 |
| `GET` | `/api/analytics/organizations/:organizationId` | グループ詳細 |
| `GET` | `/api/analytics/shops` | 店舗一覧 |
| `GET` | `/api/analytics/shops/:shopId` | 店舗詳細 |
| `GET` | `/api/analytics/shops/:shopId/cycles` | cycle一覧 |
| `GET` | `/api/analytics/shops/:shopId/cycles/:recruitmentId` | cycle詳細 |
| `GET` | `/api/analytics/segments` | segment比較 |
| `GET` | `/api/requests` | 要望一覧 |

Analytics responseはすべて次のmetadataを持ちます。

- `availability`
- `asOf`
- `dataStartDate`
- `latestCompleteSnapshotDate`
- `computedAt`
- `warnings`
- `pageInfo`

Analytics listはcursor paginationで初期50件、最大100件です。`/requests`は一page最大50件です。  
trendは最大366点、期間は最大5年、responseは512 KiB未満に制限します。
overviewに比較期間がある場合は、表示期間と比較期間の合計も5年以内に制限します。

複合filterはindexで狭めた一page最大100件の候補へ適用します。現在pageの一致が0件でもraw cursorに続きがあれば確定0件にせず、warningと次cursorを返します。

query parameterはendpointごとのallowlistで検証します。  
任意のConvex function名、index名、field式は受け取らず、存在しないIDは詳細を漏らさない同一のnot found responseにします。

## データ境界

`/requests`以外のAnalytics queryは、先にcompleteな日次runを解決し、日次行の`runId`がそのrunと一致することを確認してから返します。
`running`または`failed`のrunが残した途中行、organizations、shops、staffs、recruitments、notificationOutboxなどの運用table、旧Analytics tableを直接読みません。

グループ・店舗・segmentの日次detailは25か月だけ保持します。
保持下限は最新のcompleteなsnapshot日を基準に計算します。
これより前の期間を詳細scopeで指定した場合は保持下限へ丸め、選択期間がすべて保持期限外なら値を返しません。
現在のdimensionは保持するため、登録日が`dataStartDate`やdetail保持下限より前でも、現在の一覧と詳細では登録日を表示できます。
切替前から存在する店舗も、切替後の現在値、health、完全なcycle rateを表示します。
切替前には正確に復元できない初回募集以降のmilestoneは、未達ではなく「算出対象外」と表示します。

要望一覧はAnalytics runへ混ぜず、独立した`/requests`契約として残します。これはDashboard queryが運用tableを読まない原則の唯一の例外で、`featureRequests`と現在の`shops`を直接読み、一page最大50件を返します。
グループ名と店舗名は内部識別のため返しますが、staff email、manager email、token、通知本文、provider raw errorはDTOへ含めません。

## セキュリティと運用

- Cloudflare Accessを閲覧者の認証境界にします。
- HTTP Actionはservice credential、request size、固定request kind、rate limitを検証します。
- error logにはpayload、表示名、credentialを含めません。
- resetまたは最新日次runが`running`か`failed`の場合は、`availability: unavailable`と画面上部の警告で示します。
- JSONL出力は既存の固定GET endpointだけを全page取得し、新しい汎用proxyやexport用public APIを追加しません。service rate limitへ余白を残して逐次取得し、429だけは`Retry-After`に従って再試行します。
- HTMLとStatic Assetsを検索indexの対象外にします。

Productionでは[セキュリティ再検証](../manual/security-validation.md)の`ENV-BI-01`から`ENV-BI-05`を、同じrevisionに対して確認します。

## 関連ファイル

- `apps/analytics-dashboard/src/app/App.tsx`
- `apps/analytics-dashboard/src/routes/`
- `apps/analytics-dashboard/src/pages/`
- `apps/analytics-dashboard/src/features/analytics/`
- `apps/analytics-dashboard/src/features/requests/`
- `apps/analytics-dashboard/src/api/analyticsClient.ts`
- `apps/analytics-dashboard/src/server/analyticsRoutes.ts`
- `apps/analytics-dashboard/src/server/analyticsProxy.ts`
- `apps/analytics-dashboard/src/worker.ts`
- `convex/analyticsDashboard/dto.ts`
- `convex/analyticsDashboard/schemas.ts`
- `convex/analyticsDashboard/queries.ts`
- `convex/analyticsDashboard/httpActions.ts`
- [分析KPI蓄積基盤](analytics.md)
- [Analytics rollout](../manual/analytics-rollout.md)
