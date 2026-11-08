# GA4・GTM・Clarity運用

## 適用範囲

この手順は、全画面で起動するGTM container `GTM-P22XCGTD`、GA4 property（測定ID `G-892N66Y30T`）、Clarity projectの設定と、変更の反映・確認を扱う。  アプリが送るイベントの契約は[全ページのWeb計測](../features/web-measurement.md)を正本とする。

GA4とClarityを閲覧できるのはサービス運営者だけとする。  閲覧者を増やす場合は、token付きURLや業務情報がClarityの録画に映ること、GA4の初回`page_view`の`page_referrer`にtoken付きURLが残ることを踏まえて、先に収集範囲を見直す。

## Build設定

Web計測は、次の設定がそろったdeploy artifactで常時起動する。

| 変数 | 値 |
|---|---|
| `VITE_GTM_ID` | 対象環境の`GTM-...` |
| `VITE_APP_ENVIRONMENT` | `develop`、`preview`、`production` |
| `VITE_RELEASE_ID` | 対象artifactを特定できるcommit SHA |
| `VITE_WEB_VITALS_SAMPLE_RATE` | 未指定時は`1`。必要時だけ`0`から`1`の範囲で設定 |

有効なGTM IDを持つdeploy artifactでは、認証状態やroute種別に関係なくGTMを読み込む。  local、未知environment、不正なrelease、GTM ID欠落は誤設定として起動しない。

## GTM container

containerの構成は[ga4-gtm-container.json](ga4-gtm-container.json)を正本とする。  GTMの「コンテナをインポート」でそのまま取り込める形式である。

| 種類 | 内容 |
|---|---|
| Google tag | `GA4 - Google tag`。`send_page_view`を`false`、`page_location`をアプリが送る集計用URLにする。アプリの最初の`page_view`で、1ページにつき1回だけ発火する |
| GA4 イベントタグ | アプリが送るイベントごとに一つ。同名のカスタムイベントで発火する。イベントの一覧は[全ページのWeb計測](../features/web-measurement.md#event-contract)を正本とする |
| トリガー | すべて`Page Hostname`が`shiftori.app`のときだけ発火する。developとpreviewの計測を本番のpropertyへ混ぜないためである |
| 変数 | 測定IDの定数、dataLayerの各パラメータ、`page_location`を決めるJavaScript変数 |
| Clarity | インポート対象外。既存のMicrosoft Clarityタグをそのまま残す |

イベントタグは、イベントごとに必要なパラメータだけを送る。  GTMのdataLayerは前のイベントの値を保持するため、一つのタグで全イベントを送ると、別のイベントの値が混ざるからである。

`web_vital`以外のイベントタグは、共通のパラメータに加えて`user_id`、`organization_id`、`shop_id`、`recruitment_id`を送り、user propertyとして`organization_plan`と`display_mode`を設定する。  `user_id`はGA4のユーザーIDとして扱われる。  アプリは値のない画面でもこれらのkeyを`undefined`で上書きするため、前の画面の識別子は残らない。

Google tagと各イベントタグの`page_location`は、アプリが直前の`page_view`で送った集計用URLを使う。  Google tagを`gtm.js`ではなく最初の`page_view`で起動するのは、セッション開始などの自動イベントにも集計用URLを使うためである。  そのため、`page_view`を送らないOAuthとLINE連携のcallback画面ではGA4を起動しない。  アプリが`page_location`を送らない旧版のタブでも、queryとhashを除き、`route_family`がIDを含む画面なら固定path、`not_found`と静的404なら`/404`にする。  そのため、アプリのリリースより先にcontainerを公開しても、IDや未知URLのpathはGA4へ送られない。

### インポート手順

1. GTMの「管理」から「コンテナをインポート」を開き、`ga4-gtm-container.json`を選ぶ。
2. ワークスペースは既存のもの、インポートオプションは「統合」と「競合するタグ、トリガー、変数の名前を変更する」を選ぶ。
3. タグ一覧で、インポート前からあるGoogle tag（測定ID `G-892N66Y30T`、`send_page_view`が`true`のもの）を削除する。  Clarityタグは削除しない。
4. 「プレビュー」でTag Assistantを開き、`https://shiftori.app/`で次を確認する。
   - `page_view`で`GA4 - Google tag`と`GA4 - page_view`がそれぞれ1回発火する。
   - TOPから記事へ移動すると、`GA4 - page_view`だけがもう1回発火する。
5. 「公開」で、変更内容が分かるバージョン名を付けて公開する。

アプリが新しいイベントを送る前に公開しても問題はない。  新しいイベントは、アプリの反映後に発火し始める。

## GA4 propertyの設定

### データ保持

「データの保持」で、イベントデータの保持期間を14か月にする。  探索レポートで週ごとの推移を比べるためである。

### 拡張計測機能

「データストリーム」のウェブストリームで、拡張計測機能を次のようにする。

| 項目 | 設定 | 理由 |
|---|---|---|
| ページビュー | オン。ただし詳細設定の「ブラウザの履歴イベントに基づくページの変更」はオフ | SPA遷移のpage viewはアプリが送る |
| スクロール数 | オン | 記事の読了の目安に使う |
| 離脱クリック | オン | LINE、Stripeなど外部への遷移を見る |
| サイト内検索 | オフ | ヘルプ検索は`help_search`で送る |
| フォームの操作 | オフ | SPAのフォーム送信は取れず、スタッフの提出フォームで件数が膨らむ |
| 動画エンゲージメント | オフ | 使わない |
| ファイルのダウンロード | オフ | シフト出力は`shift_export`で送る |

### カスタム定義

「カスタム定義」で、次のイベントスコープのカスタムディメンションを登録する。  ディメンション名はパラメータ名と同じにする。  同じ意味のパラメータは複数のイベントで同じ名前を使い、登録数を抑えている（イベントスコープの上限は50件）。

| パラメータ | 用途 |
|---|---|
| `route_family` | 画面の種類 |
| `route_area` | 見込み客、登録・ログイン、管理者、スタッフ、その他の区分 |
| `content_id` | 選択されたCTA |
| `content_type` | 選択・共有された内容の種類 |
| `setup_kind` | 初回登録か、追加組織か |
| `submission_pattern` | 希望シフトの集め方 |
| `section` | 表示されたsection |
| `format` | シフト出力の形式 |
| `has_results` | ヘルプ検索の結果の有無 |
| `plan` | 申込みを始めたプラン |
| `reason` | セキュリティ確認の失敗、確定を止めた検証、スタッフのリンクを使えない理由 |
| `error_code` | Turnstile、Clerk、Convexのerror code |
| `release_id` | リリースごとの比較 |
| `document_route_family` | Web Vitalsと表示時間を測った画面 |
| `metric_name` | Web Vitalsの指標 |
| `metric_rating` | Web Vitalsの評価 |
| `viewport_class` | Web Vitalsを測った画面幅 |
| `organization_id` | 管理画面で選択中の組織 |
| `shop_id` | 管理画面で選択中の店舗 |
| `recruitment_id` | スタッフ画面の募集 |
| `method` | 認証方法、スタッフの追加方法、共有方法 |
| `stage` | デモ、オンボーディング、トライアル終了の案内の段階 |
| `result` | コードの確認結果、Stripeから戻ったときの結果 |
| `intent` | シフトの確定か、再通知か |
| `target` | `manage_action`の対象 |
| `action` | `manage_action`とホーム画面追加案内の操作 |
| `is_resubmit` | 希望シフトの再提出か |
| `used_previous_pattern` | 前回の提出内容を使ったか |
| `days_before_deadline` | 提出期限までの日数の区分 |
| `has_date_notes` | 日付ごとの連絡事項があるか |
| `access_kind` | スタッフのリンクが提出用か閲覧用か |
| `error_surface` | エラーを表示した場所 |
| `error_source` | エラーの出どころ |
| `phase` | 表示時間の段階 |

`metric_value`と`count`は、単位が「標準」のイベントスコープのカスタム指標として登録する。  `metric_value`はWeb Vitalsの値と`app_timing`のmsの両方に使う。

次の2つは、ユーザースコープのカスタムディメンションとして登録する。

| ユーザープロパティ | 用途 |
|---|---|
| `organization_plan` | 管理者が選択中の組織のプラン |
| `display_mode` | ホーム画面から起動したか、ブラウザで開いたか |

`user_id`はカスタム定義に登録しない。  GA4のユーザーIDとして扱われ、「レポート用識別子」を「ブレンド」にしておくと、同じ管理者の端末をまたいだ利用を一人として数える。

### キーイベント

`setup_complete`をキーイベントにする。  集客レポートで、チャネルごとの初期設定の完了数を見られるようになる。  GA4では届いたイベントにだけスターを付けられるため、GTMの公開後に`setup_complete`が1件届いてから登録する。

アプリの反映後、`generate_lead`、`staff_add`、`shift_confirm`、`shift_submit`が1件ずつ届いてから、同じようにキーイベントにする。  問い合わせ、スタッフの追加、シフトの確定、スタッフの提出という、利用の節目を集客と並べて見るためである。

### 除外する参照

ウェブストリームの「タグ設定を行う」から「除外する参照のリスト」を開き、参照元ドメインが次を含む場合を除外する。  ログインや決済から戻ったときに、流入元が上書きされないようにするためである。  どれも固有のドメインなので、「次を含む」でも「完全に一致」と同じ効果になる。

- `accounts.google.com`
- `accounts.google.co.jp`
- `clerk.shiftori.app`
- `access.line.me`
- `checkout.stripe.com`
- `billing.stripe.com`

### Search Consoleとのリンク

「Search Consoleのリンク」で`https://shiftori.app`のプロパティとリンクする。  GA4上で、検索語とランディングページを並べて見られるようになる。

## Develop環境

`dev-yps-crispy-carnival.pages.dev`は、GTM container `GTM-P3DL2WK5`とGA4 property「dev-シフトリ」（測定ID `G-524JVKWP2P`）を使う。  本番のpropertyへ開発中の計測を混ぜないためである。

containerは`ga4-gtm-container.json`を次のように置き換えた複製を、本番と同じ手順でインポートする。  置き換えたファイルはリポジトリに置かない。

- `Const - GA4 Measurement ID`の値を`G-524JVKWP2P`にする。
- 全トリガーの`Page Hostname`の条件を`dev-yps-crispy-carnival.pages.dev`にする。

GA4 propertyには、本番と同じカスタム定義、拡張計測機能、除外する参照を設定する。  除外する参照には、Clerkの開発用ドメインのため`accounts.dev`も加える。  データ保持とSearch Consoleとのリンクは設定しない。

Develop GA4の設定は2026-09-25時点の状態で止め、以後は追加しない。  探索、ダッシュボード、キーイベントなどの分析用設定は本番のpropertyだけで行う。

## 反映後の確認

GTMの公開後と、アプリの反映後に、GA4の「DebugView」またはリアルタイムレポートで次を確認する。

- 画面を移動するたびに`page_view`が1件だけ増え、`route_family`、`route_area`、`page_location`が付いている。
- `page_location`にqueryが含まれず、店舗、募集、人物のIDが`:shopId`などに置き換わっている。  存在しないURLでは`/404`になっている。
- TOPのCTA、料金section、ヘルプ検索で、それぞれ`select_content`、`section_view`、`help_search`が届く。
- 管理画面のイベントに`user_id`、`organization_id`、`shop_id`が付き、スタッフ画面や公開画面のイベントには付かない。
- スタッフの提出画面のイベントに`recruitment_id`が付き、URLのtokenが含まれない。
- エラーのtoastを出すと`app_error`が届き、エラーのmessageが含まれない。
- `scroll`以外に`form_start`などの拡張計測イベントが届かない。

確認した日時、GTMのバージョン、アプリのリリースは[リリース状態](release-status.md)へ記録する。

## 分析の見方

GA4の「探索」で次のレポートを作る。

| 知りたいこと | 作り方 |
|---|---|
| チャネル別の登録までの到達 | ファネルデータ探索。ステップは`route_area = public`の`page_view`、`select_content`、`route_family = auth_signup`の`page_view`、`setup_complete`。内訳は「最初のユーザーのデフォルト チャネル グループ」 |
| 料金を見て離脱しているか | ファネルデータ探索。ステップは`route_family = home`の`page_view`、`section_view`、`select_content` |
| 管理者の画面利用 | 自由形式。行は`route_family`、列は「デバイス カテゴリ」、値は「イベント数」と「アクティブ ユーザー」。フィルタは`route_area = manager`の`page_view` |
| スタッフの提出の完了率 | ファネルデータ探索。ステップは`staff_submit`と`staff_submit_completed`の`page_view`。内訳は「デバイス カテゴリ」 |
| 機能の使われ方 | 自由形式。行はイベント名と`format`、`has_results`、`plan` |
| 管理画面の操作 | 自由形式。行は`target`と`action`、値は「イベント数」と「総ユーザー数」。フィルタはイベント名`manage_action` |
| 組織ごとの利用 | 自由形式。行は`organization_id`、列はイベント名。フィルタは`route_area = manager` |
| 画面に出たエラー | 自由形式。行は`route_family`と`error_source`、`error_code`、列は`error_surface`。フィルタはイベント名`app_error` |
| スタッフのリンクが使えない理由 | 自由形式。行は`reason`、列は`access_kind`。フィルタはイベント名`staff_link_invalid` |
| 管理画面の初回表示の遅さ | 自由形式。行は`phase`、列は「デバイス カテゴリ」、値は`metric_value`の平均。フィルタはイベント名`app_timing`と`document_route_family` |

GA4の件数は広告ブロッカーなどで欠ける。  毎週、`setup_complete`の件数を[analytics-dashboard](../features/analytics-dashboard.md)の新規登録店舗数と比べ、割合が大きく変わったら計測の欠損を先に疑う。

## 停止とrollback

想定外の送信、重複したpage view、製品操作への影響を見つけた場合は、次の順で止める。

1. GTMの「バージョン」から、問題が起きる前のバージョンを公開する。
2. アプリのloader自体を止める必要がある場合は、対象environmentの`VITE_GTM_ID`を外して再build・deployする。

停止用のfeature flagはない。  GTM IDの変更は次のartifactにだけ反映されるため、即時の停止はcontainerの公開を優先する。

## 確認記録

一回の確認に次を残す。  token、credential、個人情報、Previewの共有URLは記録しない。

- 取得元：GTM Preview、GA4 DebugView、Clarity、browser network
- 対象：container、property、stream、origin、route family
- 時刻：取得日時と対象期間
- リリース：commit SHAとartifact
- 結果：Repository implemented、External configured、Production observedのどれか
