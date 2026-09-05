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

初回page viewはclient起動時に送り、SPA遷移はrootのpathname変更から送る。  同じpathnameの重複とqueryだけの変更は送らない。  異なる動的IDへの遷移は別page viewとして扱うが、ID自体はpayloadへ含めない。

Applicationの`page_view`は、raw pathnameではなく有限の`route_family`を送る。  主な分類は次のとおりであり、完全な一覧と判定順は`src/domains/webMeasurement/routePolicy.ts`を正本とする。

| 画面 | route family例 |
|---|---|
| TOP、機能、ヘルプ、問い合わせ、記事、デモ | `home`、`features`、`help_*`、`contact`、`article_*`、`demo_shiftboard` |
| 利用規約、プライバシーポリシー、特定商取引法 | `legal` |
| ログイン、登録、パスワード再設定 | `auth` |
| Dashboard、アカウント、要対応一覧 | `dashboard`、`account`、`actions` |
| 組織、課金、管理者、店舗 | `organization_management`、`billing`、`manager_management`、`shop_detail` |
| シフト、ShiftBoard、シフト出力、スタッフ | `shift_management`、`shiftboard`、`shift_export`、`staff_*` |
| token付き導線、OAuth callback | `capability`、`callback` |
| 未知URL・404 | `not_found` |

## Event contract

ApplicationがdataLayerへ追加するイベントは次に限定する。

| 種類 | 発火条件 | 主な有限値 |
|---|---|---|
| page view | 初回documentとpathnameが変わるSPA遷移 | route family、environment、release |
| 公開CTA | 登録、ヘルプ、ログインなど登録済みCTAの選択 | CTA ID、route family |
| Web Vitals | sampling対象documentでcallbackを受けたとき | metric、rating、navigation type、viewport、初回document route family |

Event unionとserializerは`src/domains/webMeasurement/`を正本とする。  任意のevent名やparameterをGTMへ渡すAPIは公開しない。  Web Vitalsはdocument lifecycleに属し、callback時点で別routeへSPA遷移していても初回documentのroute familyを保持する。

## GTM、GA、Clarityの責務

Repositoryが保証するのは、GTM loaderと有限dataLayer eventを全routeで開始するところまでである。  GAとClarityのtag、trigger、property、project、masking、publish状態は外部GTM設定が所有する。

GTMの`gtm.js`でGoogle tagとClarityを一度だけ初期化する。  Clarityは同じdocumentのSPA遷移中も継続する。  GAのpage viewは、Google tagの自動page viewとApplicationのCustom Event `page_view`を併用すると重複するため、外部設定で発火元を一つに固定する。  exact contractと確認手順は[GA4・GTM・Clarity運用](../manual/ga4-gtm.md)を正本とする。

## Privacyとlimitations

ApplicationのdataLayer payloadには、query、hash、raw URL、raw referrer、page title、動的ID、token、OAuth `code`・`state`、氏名、連絡先、店舗名、組織名、自由入力、`user_id`を含めない。

ただし、GTM container内の第三者tagがbrowserのURL、referrer、title、DOMを独自取得することはApplication serializerでは防げない。  全route計測には、bearer tokenやOAuth値をURLに持つ認証前画面と、業務情報を表示する認証後画面も含まれる。  ClarityのURL parameter masking、DOM masking、権限、保持期間は補助防御として外部設定で管理し、この収集範囲を受容したProduct判断を前提とする。

Web計測は、ad blocker、通信失敗、provider障害、別端末によって欠測する。  実人数、店舗単位のactivation、cross-device funnelの正本にはしない。

## 実装の入口

- `src/client.tsx`：全documentの初回GTM起動。
- `src/routes/__root.tsx`：SPA page view。
- `src/domains/webMeasurement/`：全routeの有限family、event union、exact serializer。
- `src/lib/webMeasurement/`：document lifecycle、page view、Web Vitals。
- `src/lib/gtm/`：GTM scriptとdataLayerのtransport。
- `src/components/shared/MeasurementLink/`：document navigation直前の登録済みCTA計測。
- `src/configs/webMeasurement.ts`：deploy artifactのruntime設定。

外部GTM container、GA4 property、Clarity projectの設定はリポジトリ実装と分ける。  設定と検証は[GA4・GTM・Clarity運用](../manual/ga4-gtm.md)、実環境への反映は[リリース状態](../manual/release-status.md)へ記録する。
