# 全ページのWeb計測

## 対象と目的

Web計測は、公開ページ、認証画面、Dashboard、管理画面、スタッフ画面、Capability・callback、法務ページ、未知URLを含む全documentでGTMを起動する。  GTM containerからGoogle AnalyticsとMicrosoft Clarityを読み込み、初回表示とSPA遷移、主な操作の成功、画面に表示したエラーを計測する。

計測には、画面がすでに持つ値だけを使う。  計測のためにqueryの戻り値を増やしたり、serverで判定したりはしない。  そのため、serverだけが知っている値（店舗で初めての操作か、スタッフ個人のID、閲覧リンクの細かい失効理由など）は送らない。

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

`page_view`には、有限の`route_family`と`route_area`、集計用の`page_location`を付ける。  `page_location`はqueryとhashを除き、店舗、募集、人物のIDを含むpathを`/manage/shops/:shopId`のような固定pathへ置き換えたURLである。  未知URLのpathには任意の文字列が入り得るため、`not_found`は入力されたpathを使わず`/404`にする。  Cloudflareが返す静的404は、記事slugなど既知routeの形をしたpathでも`not_found`として送る。  SPA遷移では直前の`page_location`を`page_referrer`として送る。  documentを読み込んだ初回の`page_view`では`page_referrer`を送らず、GA4がbrowserの`document.referrer`を加工せずに使う。  そのため、直前が同じoriginの画面なら、queryの`token`や店舗・組織IDを含むURLがGA4へ送られる。

主な分類は次のとおりであり、完全な一覧と判定順は`src/domains/webMeasurement/routePolicy.ts`を正本とする。

| 画面 | route family例 | route area |
|---|---|---|
| TOP、機能一覧、機能ページ、ヘルプ、問い合わせ、記事、デモ | `home`、`features`、`feature_detail`、`help_*`、`contact`、`article_*`、`demo_shiftboard` | `public` |
| 登録、ログイン、パスワード再設定、管理者招待 | `auth_signup`、`auth_login`、`auth_password_reset`、`manager_invite` | `auth` |
| Dashboard、アカウント、要対応一覧 | `dashboard`、`account`、`actions` | `manager` |
| 組織、課金、管理者、店舗 | `organization_management`、`billing`、`manager_management`、`shop_detail` | `manager` |
| シフト、ShiftBoard、シフト出力、スタッフ管理 | `shift_management`、`shiftboard`、`shift_export`、`staff_management`、`staff_detail`、`staff_shop` | `manager` |
| スタッフの提出、提出完了、閲覧、再発行、登録、同意 | `staff_submit`、`staff_submit_completed`、`staff_view`、`staff_reissue`、`staff_register`、`staff_legal_consent` | `staff` |
| 法務文書、utility、callback、未知URL | `legal`、`utility`、`callback`、`not_found` | `other` |

## Event contract

ApplicationがdataLayerへ追加するイベントは次に限定する。  `web_vital`以外は、送信時の`route_family`と`route_area`、[識別子](#識別子)を持つ。

### 公開画面と認証

| イベント | 発火条件 | 固有のパラメータ |
|---|---|---|
| `page_view` | 初回documentとpathnameが変わるSPA遷移 | `page_location`、`page_referrer` |
| `select_content` | TOPのheader・hero・毎月の流れ・料金section・下部CTA、機能一覧と機能ページの上部・下部CTA、記事末尾CTAの選択 | `content_type`、`content_id` |
| `section_view` | TOPの料金sectionの上端が画面の上60%へ入ったとき（TOPの表示ごとに1回） | `section`（`pricing`） |
| `help_search` | ヘルプ検索の入力が1.5秒止まったとき | `has_results`（`true`、`false`）。検索語は氏名や連絡先を含み得るため送らない |
| `generate_lead` | お問い合わせの送信に成功したとき | なし |
| `demo_progress` | デモのツアーを始めたとき、ツアーを閉じたとき、確定まで進んだとき | `stage`（`tour_start`、`tour_close`、`confirm`） |
| `security_check_issue` | スタッフ登録・問い合わせのセキュリティ確認が15秒以内に終わらない、または失敗したとき（確認のやり直しごとに理由ごと1回） | `reason`（`stalled`、`error`、`unsupported`、`interactive_timeout`、`script_load_failed`）、`error_code`（数字のTurnstile error code、なしは`none`、数字以外は`unknown`） |
| `auth_method_select` | 登録・ログイン・管理者招待でGoogleかメールを選んで始めたとき | `method`（`google`、`email`） |
| `auth_error` | Clerkの認証エラーを画面に表示したとき | `error_code`（Clerkのcode） |

登録かログインかは、`route_family`（`auth_signup`、`auth_login`、`manager_invite`など）で分ける。

### 管理画面

| イベント | 発火条件 | 固有のパラメータ |
|---|---|---|
| `setup_complete` | 初回Setupまたは追加組織の作成が成功したとき | `setup_kind`（`first`、`additional`）、`submission_pattern` |
| `promotion_code_apply` | 初期設定でコードを確認したとき | `result`（`valid`、`invalid`） |
| `onboarding_view` / `onboarding_dismiss` | Dashboardのオンボーディングを表示したとき、閉じたとき | `stage`（`create_recruitment`、`submit_self`、`review_submission`、`add_staff`） |
| `staff_add` | スタッフの追加に成功したとき | `method`（`manual`、`existing_person`、`request_approve`）、`count` |
| `share` | スタッフの参加用リンクをコピーしたとき | `method`（`copy`）、`content_type`（`staff_registration_link`） |
| `recruitment_create` | シフト募集の作成に成功したとき | なし。`shop_id`は一覧の絞り込みではなく作成した店舗にする |
| `shift_confirm` | シフトの確定、または変更の再通知に成功したとき（変更なしの再通知は除く） | `intent`（`confirm`、`resend`） |
| `shift_confirm_blocked` | 確定前の検証で確定を止めたとき | `reason`（最初の検証エラーのcode）、`count`（エラー件数） |
| `shift_export` | シフト表のPDFまたはExcelを生成して保存を始めたとき | `format`（`pdf`、`xlsx`） |
| `trial_notice_view` | 無料トライアル終了の案内を表示したとき（段階ごと） | `stage`（`early`、`soon`、`last_day`） |
| `plan_checkout_start` | 有料プランの申込みでStripeへ移動する直前 | `plan`（`standard`、`pro`） |
| `plan_checkout_result` | Stripeから課金設定へ戻ったとき | `result`（`returned`、`cancelled`） |
| `home_screen_guide` | ホーム画面への追加案内を表示したとき、開いたとき、閉じたとき | `action`（`view`、`open`、`dismiss`） |
| `feature_request_submit` | 要望の送信に成功したとき（管理者・スタッフは`route_area`で分ける） | なし |
| `manage_action` | 下の表の操作に成功したとき | `target`、`action` |

キーイベントにしない操作は、GTMのタグとGA4のカスタム定義を増やさないよう`manage_action`一つにまとめる。  `target`と`action`の組み合わせは`manageActionsByTarget`を正本とし、主なものは次のとおりである。

| `target` | `action` |
|---|---|
| `recruitment` | `update`、`delete` |
| `shift` | `save`（下書き保存） |
| `staff` | `reject_request`、`exclude`、`include`、`remove`、`reorder`、`change_shops`、`update_profile`、`rotate_link`、`line_link_issue`、`line_invite`、`line_disconnect`、`notify_recruitment`、`notify_shift` |
| `notification` | `resend`、`resend_all`、`resolve` |
| `manager` | `invite`、`resend_invite`、`revoke_invite`、`remove_role`、`accept_invite` |
| `organization` | `add_shop`、`delete_shop`、`delete_organization`、`rename`、`update_shop`、`update_billing_email` |
| `billing` | `change_plan_now`、`schedule_plan_change`、`cancel_plan_change`、`schedule_stop`、`cancel_trial_continuation`、`open_portal`、`cancel_checkout` |
| `account` | `legal_consent` |

### スタッフ画面

| イベント | 発火条件 | 固有のパラメータ |
|---|---|---|
| `staff_register_submit` | 参加申請が受理されたとき | なし |
| `staff_legal_consent` | 規約への同意に成功したとき | なし |
| `shift_submit` | 希望シフトの提出に成功したとき | `is_resubmit`、`used_previous_pattern`、`days_before_deadline`、`submission_pattern`、`has_date_notes` |
| `staff_link_invalid` | 提出・閲覧リンクを使えない画面を表示したとき | `reason`、`access_kind`（`submit`、`view`） |
| `staff_link_reissue` | リンクの再発行の送信に成功したとき | なし |

`days_before_deadline`は、JSTの今日から提出期限までの日数を`overdue`、`0`、`1`、`2_3`、`4_7`、`8_14`、`15_plus`に分ける。

`staff_link_invalid`の`reason`は、serverが返す結果と画面の状態から分ける。  tokenがない（`no_token`）、存在しないリンク（`unknown_link`）、リンクを使えない（`rejected`）、session確立後の取得で使えない（`session_rejected`）、募集の削除（`recruitment_deleted`）、提出の締切（`submission_closed`）、利用上限（`usage_limit_exceeded`、`usage_limit_evaluation_unavailable`）、試行回数の制限（`rate_limited`）である。  serverは期限切れや使用済みを`rejected`へまとめて返すため、これらは区別しない。

### エラーと表示時間

| イベント | 発火条件 | 固有のパラメータ |
|---|---|---|
| `app_error` | エラーをtoast、画面全体、section、Dialogに表示したとき | `error_surface`、`error_source`、`error_code` |
| `app_timing` | Web Vitalsのsampling対象documentで、Clerkの読み込み、ユーザー情報の取得、画面表示が終わったとき（段階ごとに1回） | `phase`（`clerk_loaded`、`user_loaded`、`app_ready`）、`metric_value`（document開始からのms）、`document_route_family` |
| `web_vital` | sampling対象documentでcallbackを受けたとき | metric、rating、navigation type、viewport、初回documentのroute family |

`app_error`は、serverのエラーログではなく、利用者がエラーを見た事実を数える。  `showErrorToast`、`ErrorBoundary`、`RouteErrorFallback`、Dashboardのsection、Dialogの読み込み失敗、画面内に表示するserverの業務エラーから送る。  未認証でログインへ戻すだけのboundaryは数えない。

| `error_source` | 意味 |
|---|---|
| `server_business` | `ConvexError`で返る想定内の拒否 |
| `server_unexpected` | serverで想定外のエラーが起き、Convexが`Server Error`として返したもの |
| `network` | 通信の失敗 |
| `chunk_load` | deploy直後などのJS・CSSの読み込み失敗 |
| `render` | boundaryが捕まえた描画エラー |
| `client` | toastに出した画面側の検証エラー |

`error_code`は、`ConvexError`のdataまたはcodeが英数字だけのときに小文字へ正規化して送る。  日本語のメッセージや入力値を含み得る文字列は`other`、codeがない場合は`none`にする。  エラーのmessageとstackは送らない。

Event unionとserializerは`src/domains/webMeasurement/`を正本とする。  任意のevent名やparameterをGTMへ渡すAPIは公開しない。  画面操作のイベントは処理の成功後に一回だけ送り、失敗、古いリクエストの完了、再描画では送らない。  Web Vitalsと`app_timing`はdocument lifecycleに属し、送信時点で別routeへSPA遷移していても初回documentのroute familyを保持する。

## 識別子

`web_vital`以外のイベントには、次の識別子を付ける。

| パラメータ | 値 | 付ける画面 |
|---|---|---|
| `user_id` | ClerkのユーザーID | `route_area`が`manager`の画面 |
| `organization_id` | 画面が検証した組織のConvex ID | `route_area`が`manager`の画面 |
| `shop_id` | 画面が操作している店舗のConvex ID | 店舗を対象にする`manager`の画面 |
| `organization_plan`（user property） | 画面が検証した組織のプラン | `route_area`が`manager`の画面 |
| `recruitment_id` | 検証済みのスタッフsessionの募集ID | `route_area`が`staff`の画面 |
| `display_mode`（user property） | `standalone`（ホーム画面から起動）または`browser` | 全画面 |

管理者の値は、`AuthGuard`がユーザー情報を確定してから付ける。  そのため、ログイン直後の最初の`page_view`には付かない。  組織は`AppOrganizationScopeProvider`、店舗は`ManagerShopScopeProvider`が渡す値を使い、保存済みの店舗選択は使わない。  スタッフの値は、tokenの検証が成功してから付ける。  URLのtokenとsession tokenは送らない。

GTMのdataLayerは前のpushの値を保持するため、識別子のkeyは毎回置き、値がない画面では`undefined`で上書きする。  `users`テーブルのIDやスタッフ個人のIDは画面に届いていないため送らない。  IDの形をしていない値は送らない。

## GTM、GA、Clarityの責務

Repositoryが保証するのは、GTM loaderと有限dataLayer eventを全routeで開始するところまでである。  GAとClarityのtag、trigger、property、project、publish状態は外部GTM設定が所有する。

GA4のpage viewは、Applicationの`page_view`だけを発火元にする。  Google tagの自動page viewとEnhanced Measurementのbrowser history page viewは無効にし、二重計測を防ぐ。  container構成、GA4 propertyの設定、確認手順は[GA4・GTM・Clarity運用](../manual/ga4-gtm.md)を正本とする。

## Privacyとlimitations

ApplicationのdataLayer payloadには、query、hash、token、OAuth `code`・`state`、氏名、連絡先、店舗名、組織名、自由入力、エラーのmessageを含めない。  IDは[識別子](#識別子)の項目だけに限り、`page_location`のpathには含めない。

ヘルプの検索語は、結果が0件のときだけ送る。  空白を整えて30文字以内に限り、`@`、4桁以上の数字、URLを含む語は送らない。

GA4とClarityの閲覧者はサービス運営者だけに限る。  GTM container内の第三者tagがbrowserのURL、referrer、DOMを独自取得することはApplication serializerでは防げないため、Google tagの`page_location`もqueryを除いたURLへ設定する。

一方、初回`page_view`の`page_referrer`は加工しないため、スタッフ画面の`token`や店舗・組織IDを含むURLがGA4に残り得る。  閲覧者がサービス運営者だけであることを前提に、この状態を許容している。  閲覧者を増やす前に、同じoriginのreferrerからqueryと動的IDを除く。

Web計測は、ad blocker、通信失敗、provider障害、別端末によって欠測する。  実人数、店舗単位のactivation、cross-device funnelの正本にはしない。  初期設定の完了数は、Convex Analyticsの新規登録店舗と比べて計測の欠損率を確認する。

## 実装の入口

- `src/client.tsx`：全documentの初回GTM起動。
- `src/routes/__root.tsx`：SPA page view。
- `src/domains/webMeasurement/`：全routeの有限family、event union、exact serializer。
- `src/lib/webMeasurement/`：document lifecycle、page view、Web Vitals。
- `src/lib/gtm/`：GTM scriptとdataLayerのtransport。
- `src/components/shared/MeasurementLink/`：document navigation直前の登録済みCTA計測。
- `AuthenticatedApp/AuthGuard`：管理者の識別子と`app_timing`。
- `StaffAccess`：スタッフの識別子と`staff_link_invalid`。
- `src/lib/webMeasurement/appError.ts`：画面に出たエラーの分類。
- `shared/feedback`、`ui/ErrorBoundary`、`ui/RouteErrorFallback`：`app_error`を送る主な場所。
- 各featureの操作の成功処理：画面操作のイベントを送る場所。  送信箇所は`trackProductEvent`の呼び出しで確認する。
- `src/configs/webMeasurement.ts`：deploy artifactのruntime設定。

外部GTM container、GA4 property、Clarity projectの設定はリポジトリ実装と分ける。  設定と検証は[GA4・GTM・Clarity運用](../manual/ga4-gtm.md)、実環境への反映は[リリース状態](../manual/release-status.md)へ記録する。
