# 公開サイトのWeb計測

## 対象と目的

公開サイトのWeb計測は、同意した端末に限り、公開ページの導線と表示性能を低cardinalityのイベントとして記録する。  実人数、店舗単位の業務成果、スタッフの提出事実は表さない。

スタッフの提出、募集、確定、継続利用は、既存のConvex Analyticsを正本とする。  Web計測の欠測を業務上の失敗として扱わず、計測失敗でフォーム送信や画面遷移を止めない。

## 読み込み条件

GTMは、次の条件をすべて満たすdocumentでだけ読み込む。

1. build時にWeb計測が明示的に有効化されている。
2. 有効なGTM container IDが設定されている。
3. 利用者が公開サイト上でアクセス解析を許可している。
4. 初回documentと現在routeが、どちらも計測対象の公開routeである。

許可前の行動はbufferせず、後から送信しない。  初めて許可した場合は同じURLを再読み込みし、同意済みで開始した新しいdocumentからだけ計測する。  これにより、同意前に生成されたWeb Vitalsのbuffered entryも送らない。

許可を取り消した場合は新しいイベントを止め、documentを再読み込みする。  これは、一度読み込まれたGTM container内の第三者codeをSPA上だけで完全にunloadできないためである。

取り消しの保存に失敗した場合は、古い`granted`を次documentで再利用しない同一tab guardを残し、確定した「不許可」とは表示しない。  別tabで許可、拒否、削除、不正値への変更を検出した場合も、現在documentを停止して新documentだけで状態を再評価する。

## Route surface

| Surface | 対象 | 第三者script |
|---|---|---|
| 計測する公開面 | TOP、機能、ヘルプ一覧・使い方詳細、問い合わせ、記事一覧・詳細・カテゴリ、2種類のデモ | 条件を満たした場合だけ読み込む |
| 計測しない公開面 | 法務文書、削除受付、cache reset | 読み込まない |
| 非公開面 | 認証、Dashboard、店舗・人物・ShiftBoard、Capability、staff、callback、未知URL | 読み込まない |

ヘルプ一覧は`help_index`、使い方詳細はslugにかかわらず`help_guide`へ写像する。
その他の動的URLも有限のroute familyへ写像し、ヘルプ・記事のslug、店舗ID、人物ID、募集ID、query、hash、raw URLは送らない。

公開面と非公開面を越えるlinkは、通常のdocument navigationを使う。  一度読み込まれた第三者scriptをSPA遷移先へ残さないためである。

## Event contract

初期実装は次のイベントだけを扱う。

| 種類 | 発火条件 | 主な有限値 |
|---|---|---|
| page view | 計測対象の公開routeを表示したとき | route family、environment、release |
| 公開CTA | 登録、デモ、ログインなど、登録済みCTAを選んだとき | CTA ID、route family |
| デモ価値到達 | 募集、提出、調整を経て確定操作を完了したとき | demo flow |
| Web Vitals | sampling対象documentでcallbackを受けたとき | metric、rating、navigation type、viewport、初回document route family |

Event unionとserializerは`src/domains/webMeasurement/`を正本とする。  Featureから任意のevent名やparameterをGTMへ渡すAPIは公開しない。

既存GTM loaderを検出したdocumentはdataLayerとloaderをbest-effortで破棄し、再利用も再初期化もしない。  実行済みcodeの完全なunloadは保証できないため、外部設定またはartifactの異常としてenableをoffに戻す。

## Web Vitalsの帰属

Web Vitalsはdocument lifecycleに属する。  callback時点で別の公開routeへSPA遷移していても、初回documentのroute familyを保持する。

初期documentのviewportを`mobile`または`desktop`へ分類し、releaseとenvironmentを付ける。  CSR遷移の待ち時間はWeb Vitalsへ混ぜず、別の性能指標として扱う。

## Privacyとlimitations

次の値は送信しない。

- token、OAuth `code`・`state`、認証情報。
- query、hash、raw URL、raw referrer、page title。
- 氏名、メール、電話番号、店舗名、組織名、問い合わせ本文、検索語。
- Clerk ID、店舗ID、人物ID、スタッフID、募集IDなどの内部ID。
- `user_id`、user property、生の件数。

Application serializerだけでは、GTM・GA4がbrowserのURL、referrer、titleを独自取得することを防げない。  Google tagの自動page viewとEnhanced Measurementを無効にし、page contextを有限のsynthetic値へ上書きする外部設定を公開前の必須gateとする。  Clarityはraw referrer・clicked URL禁止を満たす別判断とnetwork検証が終わるまで初期publish対象外とする。

Web計測は、同意拒否、ad blocker、通信失敗、別端末によって欠測する。  そのため、全訪問者率、実人数、店舗単位のactivation、cross-device funnelとは呼ばない。

## 実装の入口

- `src/domains/webMeasurement/`：route policy、event union、exact serializer。
- `src/components/features/WebMeasurementConsent/`：同意の保存、設定変更、runtime接続。
- `src/lib/webMeasurement/`：document lifecycle、page view、Web Vitals。
- `src/lib/gtm/`：GTM scriptとdataLayerのtransport。
- `src/components/shared/MeasurementBoundaryLink/`：計測surface境界のdocument navigation。
- `src/configs/webMeasurement.ts`：build時のdefault-closed設定。

外部GTM container、GA4 property、Clarity projectの設定はリポジトリでは確認できない。  設定と検証は[GA4・GTM運用](../manual/ga4-gtm.md)、実環境への反映は[リリース状態](../manual/release-status.md)へ分けて記録する。
