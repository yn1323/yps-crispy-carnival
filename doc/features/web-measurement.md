# 全ページのWeb計測

## 対象と目的

Web計測は、公開ページ、認証画面、Dashboard、管理画面、スタッフ画面、Capability・callback、法務ページ、未知URLを含む全documentでGTMを起動する。  GTM containerからGoogle AnalyticsとMicrosoft Clarityを読み込み、初回表示とSPA遷移を計測する。

同意状態、認証状態、route種別は起動条件にしない。  アクセス解析の同意UIと保存済みdecisionは使用せず、旧localStorage値が`denied`でも計測を止めない。

スタッフの提出、募集、確定、継続利用などの業務成果は、既存のConvex Analyticsを正本とする。  Web計測の欠測を業務上の失敗として扱わず、計測失敗でフォーム送信や画面遷移を止めない。

## Runtimeの起動条件

GTMは、次の設定がそろったdeploy artifactで起動する。

1. `VITE_GTM_ID`が有効な`GTM-...`である。
2. environmentが`develop`、`preview`、`production`のいずれかである。
3. release IDが`unknown`または`local`ではない。

`VITE_WEB_MEASUREMENT_ENABLED`のような停止用feature flagは使用しない。  `src/client.tsx`がhydration判定より前に初期化するため、Reactをhydrateしない静的404でもGTMを起動する。  同じdocumentでは既存loaderを検出し、GTM scriptを一件だけにする。

local build、GTM ID欠落、不正なreleaseでは第三者URLを組み立てない。  これは同意gateではなく、誤設定と二重loaderを防ぐruntime検証である。

## Page viewとroute family

初回page viewはclient起動時に送り、SPA遷移はrootのpathname変更から送る。  同じpathnameの重複とqueryだけの変更は送らない。  OAuthとLINE連携のcallback（`callback`）は通過するだけの画面なので、page viewを送らない。

`page_view`には、有限の`route_family`と`route_area`、集計用の`page_location`を付ける。  `page_location`はqueryとhashを除き、店舗、募集、人物のIDを含むpathを`/manage/shops/:shopId`のような固定pathへ置き換えたURLである。  SPA遷移では直前の`page_location`を`page_referrer`として送り、初回はGA4がdocumentの参照元を使う。

主な分類は次のとおりであり、完全な一覧と判定順は`src/domains/webMeasurement/routePolicy.ts`を正本とする。

| 画面 | route family例 | route area |
|---|---|---|
| TOP、機能、ヘルプ、問い合わせ、記事、デモ | `home`、`features`、`help_*`、`contact`、`article_*`、`demo_shiftboard` | `public` |
| 登録、ログイン、パスワード再設定、管理者招待 | `auth_signup`、`auth_login`、`auth_password_reset`、`manager_invite` | `auth` |
| Dashboard、アカウント、要対応一覧 | `dashboard`、`account`、`actions` | `manager` |
| 組織、課金、管理者、店舗 | `organization_management`、`billing`、`manager_management`、`shop_detail` | `manager` |
| シフト、ShiftBoard、シフト出力、スタッフ管理 | `shift_management`、`shiftboard`、`shift_export`、`staff_management`、`staff_detail`、`staff_shop` | `manager` |
| スタッフの提出、提出完了、閲覧、再発行、登録、同意 | `staff_submit`、`staff_submit_completed`、`staff_view`、`staff_reissue`、`staff_register`、`staff_legal_consent` | `staff` |
| 法務文書、utility、callback、未知URL | `legal`、`utility`、`callback`、`not_found` | `other` |

## Event contract

ApplicationがdataLayerへ追加するイベントは次に限定する。  `web_vital`以外は、送信時の`route_family`と`route_area`を持つ。

| イベント | 発火条件 | 固有のパラメータ |
|---|---|---|
| `page_view` | 初回documentとpathnameが変わるSPA遷移 | `page_location`、`page_referrer` |
| `select_content` | TOPのheader・hero・下部CTAと、記事末尾CTAの選択 | `content_type`、`content_id` |
| `setup_complete` | 初回Setupまたは追加組織の作成が成功したとき | `setup_kind`（`first`、`additional`）、`submission_pattern` |
| `section_view` | TOPの料金sectionの上端が画面の上60%へ入ったとき（TOPの表示ごとに1回） | `section`（`pricing`） |
| `shift_export` | シフト表のPDFまたはExcelを生成して保存を始めたとき | `format`（`pdf`、`xlsx`） |
| `help_search` | ヘルプ検索の入力が1.5秒止まったとき | `has_results`（`true`、`false`） |
| `plan_checkout_start` | 有料プランの申込みでStripeへ移動する直前 | `plan`（`standard`、`pro`） |
| `web_vital` | sampling対象documentでcallbackを受けたとき | metric、rating、navigation type、viewport、初回documentのroute family |

Event unionとserializerは`src/domains/webMeasurement/`を正本とする。  任意のevent名やparameterをGTMへ渡すAPIは公開しない。  画面操作のイベントは処理の成功後に一回だけ送り、失敗、古いリクエストの完了、再描画では送らない。  Web Vitalsはdocument lifecycleに属し、callback時点で別routeへSPA遷移していても初回documentのroute familyを保持する。

## GTM、GA、Clarityの責務

Repositoryが保証するのは、GTM loaderと有限dataLayer eventを全routeで開始するところまでである。  GAとClarityのtag、trigger、property、project、publish状態は外部GTM設定が所有する。

GA4のpage viewは、Applicationの`page_view`だけを発火元にする。  Google tagの自動page viewとEnhanced Measurementのbrowser history page viewは無効にし、二重計測を防ぐ。  container構成、GA4 propertyの設定、確認手順は[GA4・GTM・Clarity運用](../manual/ga4-gtm.md)を正本とする。

## Privacyとlimitations

ApplicationのdataLayer payloadには、query、hash、動的ID、token、OAuth `code`・`state`、氏名、連絡先、店舗名、組織名、自由入力、検索語、`user_id`を含めない。

GA4とClarityの閲覧者はサービス運営者だけに限る。  GTM container内の第三者tagがbrowserのURL、referrer、DOMを独自取得することはApplication serializerでは防げないため、Google tagの`page_location`もqueryを除いたURLへ設定する。

Web計測は、ad blocker、通信失敗、provider障害、別端末によって欠測する。  実人数、店舗単位のactivation、cross-device funnelの正本にはしない。  初期設定の完了数は、Convex Analyticsの新規登録店舗と比べて計測の欠損率を確認する。

## 実装の入口

- `src/client.tsx`：全documentの初回GTM起動。
- `src/routes/__root.tsx`：SPA page view。
- `src/domains/webMeasurement/`：全routeの有限family、event union、exact serializer。
- `src/lib/webMeasurement/`：document lifecycle、page view、Web Vitals。
- `src/lib/gtm/`：GTM scriptとdataLayerのtransport。
- `src/components/shared/MeasurementLink/`：document navigation直前の登録済みCTA計測。
- `Dashboard/Setup`、`OrganizationCreation`、`LandingPage/PricingSection`、`ShiftExport`、`HelpCenter/HelpIndex`、`BillingSettings`：画面操作のイベントを送る場所。
- `src/configs/webMeasurement.ts`：deploy artifactのruntime設定。

外部GTM container、GA4 property、Clarity projectの設定はリポジトリ実装と分ける。  設定と検証は[GA4・GTM・Clarity運用](../manual/ga4-gtm.md)、実環境への反映は[リリース状態](../manual/release-status.md)へ記録する。
