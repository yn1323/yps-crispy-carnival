# GA4・GTM運用

## 適用範囲

この手順は、公開サイト用のGTM containerとGA4 propertyを確認し、安全性を検証してから公開する作業を扱う。  リポジトリへ計測codeがあることを、外部設定済みまたはProduction計測済みの証拠として扱わない。

GTM・GA4・Clarityの設定変更とpublishには、対象環境を特定した明示承認が必要である。  read-only棚卸しは設定変更と分ける。

## 状態の分離

| 状態 | 完了条件 | 記録先 |
|---|---|---|
| Repository implemented | 対象test、lint、type-check、buildが成功 | Pull Requestまたは作業記録 |
| External configured | container、property、stream、Consent、保持、maskingを確認 | 本手順の確認記録 |
| Production observed | 対象releaseで許可前・非公開面0件と公開eventを確認 | [リリース状態](release-status.md) |

## Read-only棚卸し

publish前に、環境ごとに次を確認する。

- Develop、Preview、Productionでcontainer、GA4 property、web data streamが分離されているか。
- GTMに初回page view、History Change、All Clicks、広いlink click、Custom HTMLが残っていないか。Google tagの`send_page_view`が`false`か。
- Google tagとGA4 event tagが、`page_view`、`select_content`、`tutorial_complete`、`web_vital`の登録済みeventだけを受けるか。
- GA4 Enhanced Measurementが無効か。page viewだけでなく、scroll、outbound click、site search、video、file download、form interactionも自動収集しない。
- Google Signals、Ads連携、User-ID、user-provided data collection、cross-domainが無効か。
- data redactionでemailとcredential query名が防御的に登録されているか。
- Clarity tagがcontainerと配信済みversionのどちらにも存在せず、projectがoffか。

GA4のdata redactionはbest-effortの補助防御であり、禁止値を送らないapplication serializerの代わりにしない。  Googleの公式資料も、redaction後の法令対応責任は設定者に残ると説明している。[GA4 data redaction](https://support.google.com/analytics/answer/13544947?hl=en)

## Build設定

Web計測は次の設定がそろった場合だけ有効になる。

| 変数 | 値 |
|---|---|
| `VITE_WEB_MEASUREMENT_ENABLED` | 明示的に`true` |
| `VITE_GTM_ID` | 対象環境専用の`GTM-...` |
| `VITE_APP_ENVIRONMENT` | `develop`、`preview`、`production` |
| `VITE_RELEASE_ID` | 対象artifactを特定できるcommit SHA |
| `VITE_WEB_VITALS_SAMPLE_RATE` | 未指定時は`1`。必要時だけ`0`から`1`の範囲で設定 |

Workflowはenvironment、release、sampling値を渡すが、enable値とcontainer IDをリポジトリへ保存しない。  `develop`、`preview`、`production`以外のenvironment、不正、`unknown`または`local`のrelease、local buildはdefault closedである。

## Consentと第三者tag

初期方式はBasic Consent Modeとする。  許可前はGoogle tagとClarity tagをloadせず、cookieless pingも送らない。

GoogleはBasicとAdvancedの両方式を説明しており、Advanced方式では拒否時にもtagをloadして信号を送る。  本実装はその通信を採用していない。[Google Consent Mode](https://developers.google.com/tag-platform/security/guides/consent)

Clarityは初期publishの対象外とし、GTM tagを置かずprojectもoffにする。  ClarityのURL parameter maskingはpage URLだけを対象とし、referrerやclick先URLには適用されないため、Consent Modeやinput maskingだけでは本システムのraw referrer・clicked URL禁止を満たさない。[Clarity FAQ](https://learn.microsoft.com/en-us/clarity/faq)

Clarityを将来検討する場合は、SecurityとProductの別判断、収集目的と保持期間、公開面だけへ閉じる実装、referrer・click先URLを含むnetwork/recording検証を先に完了する。  その証跡がそろうまでtagを追加または有効化しない。

## GTM・GA4のexact tag contract

Applicationのexact serializerは、GTM containerがbrowser組み込み変数を独自取得することまでは防げない。  外部設定は次の契約をすべて満たす。

1. Google tagは`send_page_view = false`とし、GA4 Enhanced Measurementをすべて無効にする。
2. TriggerはCustom Eventの`page_view`、`select_content`、`tutorial_complete`、`web_vital`だけに限定する。History Change、All Pages、Initialization、All Clicks、Just Links、Form Submission、Custom HTMLを使わない。
3. GTMの組み込み`Page URL`、`Page Path`、`Referrer`、`Page Title`、`Click URL`をtag、trigger、variableから参照しない。
4. `route_family`または`document_route_family`は`src/domains/webMeasurement/`の有限値だけを受けるLookup Tableにし、defaultはtagを発火しない。
5. GA4へ渡すpage contextは次の有限値へ必ず上書きする。値を省略してbrowser既定値へfallbackさせない。

| GA4 parameter | GTMで設定する値 |
|---|---|
| `page_location` | Lookup Tableで`https://shiftori.app/__measurement/<route-family>`へ写像したsynthetic URL |
| `page_referrer` | 定数`https://shiftori.app/__measurement/referrer-not-collected` |
| `page_title` | Lookup Tableで`shiftori:<route-family>`へ写像したsynthetic title |

Lookup Tableへ登録するroute familyは`home`、`features`、`pricing`、`faq`、`howto`、`contact`、`articles_index`、`article_detail`、`article_category`、`demo_flow`、`demo_shiftboard`だけとする。  未知値ではGoogle tagとGA4 event tagを発火させない。
`/terms*`、`/privacy*`、`/commercial-transactions`などの法務文書は`public_unmeasured`として公開表示だけを行い、page viewとWeb Vitalsを送らない。

GTM loaderの既存scriptをapplicationが検出した場合、dataLayerとloaderをbest-effortで破棄し、そのdocumentでは再初期化しない。  ただし実行済みの第三者codeを完全にはunloadできないため、検出時は外部containerまたはbaked scriptの混入としてenableをoffに戻し、安全なartifactへrollbackする。

このexact contractのread-only棚卸しとPreview network検証が完了し、対象container versionを記録するまでは、各environmentの`VITE_WEB_MEASUREMENT_ENABLED`を未設定または`false`のままにする。  Repository implementedだけを根拠にenableを`true`へ変えない。

## GA4の初期設定

初期公開では次の設定に限定する。

- User-IDとuser propertyを送らない。
- user-provided data collectionと自動検出を有効にしない。
- Google SignalsとAds連携を有効にしない。
- event-level data retentionは2か月を初期値とし、延長は分析目的と法務判断を別途記録する。
- key eventは安全性、重複率、欠測率を確認してから必要な少数だけ指定する。

標準GA4 propertyのevent-level retentionは2か月または14か月である。  この設定は標準集計reportではなく、explorationとfunnelなどのevent-level dataに影響する。[GA4 data retention](https://support.google.com/analytics/answer/7667196?hl=en)

## Preview検証

GTMのWorkspaceからPreviewを開き、syntheticな公開URLだけで検証する。  Tag Assistantはdraft containerをpublish前に確認できる。[Tag Manager Preview](https://support.google.com/tagmanager/answer/6107056?hl=en)

次の順で確認する。

1. 計測を許可していない新しいbrowser contextで公開ページを開く。
2. `googletagmanager.com`、Google Analytics、`clarity.ms`へのrequestが0件であることを確認する。
3. 許可後に同じURLが一度再読み込みされ、GTM scriptが一件だけloadされ、再読み込み後の`page_view`が一件だけ発火することを確認する。同意前documentのWeb Vitalsが送られていないことも確認する。
4. CTAとデモ完了を操作し、登録済みeventと有限parameterだけを確認する。GA4 requestの`dl`、`dr`、`dt`が上記synthetic値だけであり、表示中URLのquery、hash、title、referrer、click先URLが含まれないことをnetworkで確認する。
5. Dashboard、認証、Capability、staff、callbackのsynthetic URLを新しいdocumentで開き、第三者requestが0件であることを確認する。
6. 許可を取り消し、reload後に第三者requestが発生しないことを確認する。
7. URL、query、ID、token、code、state、メール、店舗名、自由入力がTag Assistant、dataLayer、GA4 network requestにないことを確認する。`clarity.ms`へのrequestは許可後も0件であることを確認する。
8. GA4 DebugViewで同じeventを確認する。DebugViewはdebug modeの端末から収集したeventをreal timeで確認する機能である。[GA4 DebugView](https://support.google.com/analytics/answer/7201382?hl=en)

将来の別判断でClarityを検証する場合も、Strict maskingは補助防御にすぎず、referrer・clicked URLの禁止を代替しない。  masking設定は新しいrecordingにだけ反映され、過去dataへ遡及しない。[Clarity masking](https://learn.microsoft.com/ja-jp/clarity/setup-and-installation/clarity-masking)

## Publishとrollback

Preview結果へ対象container version、property、stream、release、時刻を記録してからpublishする。  公開後は同じreleaseで最小のProduction確認を行い、[リリース状態](release-status.md)へ証跡を残す。

禁止値、非公開面のrequest、重複page view、Consent前通信のいずれかを検出した場合は、次の順で停止する。

1. environmentの`VITE_WEB_MEASUREMENT_ENABLED`を無効化して再buildする。
2. GTM containerを直前の安全なversionへ戻す。
3. 収集済みdataに禁止値がある場合は、対象event、parameter、期間を特定し、GA4のdata deletionを別の承認手順で行う。
4. 原因をapplication、container、property、Clarity projectへ分けてから再開する。

## 確認記録

一回の確認に次を残す。

- source：GTM Preview、GA4 DebugView、Clarity、browser network。
- target：container、property、stream、project、origin、具体route family。
- time：取得日時、対象期間、timezone。
- slice：device、environment、filter。
- quality：sample、欠測、ad blocker、Consent状態。
- release：commit SHAとartifact。
- result：Repository implemented、External configured、Production observedのどれか。

token、credential、個人情報、Preview共有URL、外部管理画面の公開URLは文書へ保存しない。
