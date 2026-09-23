# GA4・GTM・Clarity運用

## 適用範囲

この手順は、全画面で起動するGTM container `GTM-P22XCGTD`、GA4 property（測定ID `G-892N66Y30T`）、Clarity projectの設定と、変更の反映・確認を扱う。  アプリが送るイベントの契約は[全ページのWeb計測](../features/web-measurement.md)を正本とする。

GA4とClarityを閲覧できるのはサービス運営者だけとする。  閲覧者を増やす場合は、token付きURLや業務情報がClarityの録画に映ることを踏まえて、先に収集範囲を見直す。

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
| GA4 イベントタグ | `page_view`、`select_content`、`setup_complete`、`section_view`、`shift_export`、`help_search`、`plan_checkout_start`、`web_vital`の8つ。同名のカスタムイベントで発火する |
| トリガー | すべて`Page Hostname`が`shiftori.app`のときだけ発火する。developとpreviewの計測を本番のpropertyへ混ぜないためである |
| 変数 | 測定IDの定数、dataLayerの各パラメータ、`page_location`を決めるJavaScript変数 |
| Clarity | インポート対象外。既存のMicrosoft Clarityタグをそのまま残す |

イベントタグは、イベントごとに必要なパラメータだけを送る。  GTMのdataLayerは前のイベントの値を保持するため、一つのタグで全イベントを送ると、別のイベントの値が混ざるからである。

Google tagと各イベントタグの`page_location`は、アプリが直前の`page_view`で送った集計用URLを使う。  Google tagを`gtm.js`ではなく最初の`page_view`で起動するのは、セッション開始などの自動イベントにも集計用URLを使うためである。  そのため、`page_view`を送らないOAuthとLINE連携のcallback画面ではGA4を起動しない。  アプリが`page_location`を送らない旧版では、queryとhashを除いた現在のURLを使い、`route_family`が`not_found`なら`/404`にする。

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

「カスタム定義」で、次のイベントスコープのカスタムディメンションを登録する。  ディメンション名はパラメータ名と同じにする。

| パラメータ | 用途 |
|---|---|
| `route_family` | 画面の種類 |
| `route_area` | 見込み客、登録・ログイン、管理者、スタッフ、その他の区分 |
| `content_id` | 選択されたCTA |
| `setup_kind` | 初回登録か、追加組織か |
| `submission_pattern` | 初期設定で選んだ希望シフトの集め方 |
| `section` | 表示されたsection |
| `format` | シフト出力の形式 |
| `has_results` | ヘルプ検索の結果の有無 |
| `plan` | 申込みを始めたプラン |
| `release_id` | リリースごとの比較 |
| `document_route_family` | Web Vitalsを測った画面 |
| `metric_name` | Web Vitalsの指標 |
| `metric_rating` | Web Vitalsの評価 |
| `viewport_class` | Web Vitalsを測った画面幅 |

`metric_value`は、単位が「標準」のイベントスコープのカスタム指標として登録する。

### キーイベント

`setup_complete`をキーイベントにする。  集客レポートで、チャネルごとの初期設定の完了数を見られるようになる。

### 除外する参照

ウェブストリームの「タグ設定を行う」から「除外する参照のリスト」を開き、参照元ドメインが次と完全に一致する場合を除外する。  ログインや決済から戻ったときに、流入元が上書きされないようにするためである。

- `accounts.google.com`
- `clerk.shiftori.app`
- `access.line.me`
- `checkout.stripe.com`
- `billing.stripe.com`

### Search Consoleとのリンク

「Search Consoleのリンク」で`https://shiftori.app`のプロパティとリンクする。  GA4上で、検索語とランディングページを並べて見られるようになる。

## 反映後の確認

GTMの公開後と、アプリの反映後に、GA4の「DebugView」またはリアルタイムレポートで次を確認する。

- 画面を移動するたびに`page_view`が1件だけ増え、`route_family`、`route_area`、`page_location`が付いている。
- `page_location`にqueryが含まれず、店舗、募集、人物のIDが`:shopId`などに置き換わっている。  存在しないURLでは`/404`になっている。
- TOPのCTA、料金section、ヘルプ検索で、それぞれ`select_content`、`section_view`、`help_search`が届く。
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
