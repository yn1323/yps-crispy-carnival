# GA4・GTM・Clarity運用

## 適用範囲

この手順は、全画面で起動するGTM container、GA4 property、Clarity projectを確認し、PreviewからProductionへ公開する作業を扱う。  リポジトリへloaderがあることを、外部tag設定済みまたはProduction計測済みの証拠として扱わない。

GTM・GA4・Clarityの設定変更とpublishには、対象環境を特定した明示承認が必要である。  read-only棚卸しは設定変更と分ける。

## 状態の分離

| 状態 | 完了条件 | 記録先 |
|---|---|---|
| Repository implemented | 対象test、lint、type-check、buildが成功 | Pull Requestまたは作業記録 |
| External configured | container、property、stream、project、発火元、masking、保持を確認 | 本手順の確認記録 |
| Production observed | 対象releaseで公開・認証・Dashboard・スタッフ・Capabilityの代表routeを確認 | [リリース状態](release-status.md) |

## Build設定

Web計測は、次の設定がそろったdeploy artifactで常時起動する。

| 変数 | 値 |
|---|---|
| `VITE_GTM_ID` | 対象環境の`GTM-...` |
| `VITE_APP_ENVIRONMENT` | `develop`、`preview`、`production` |
| `VITE_RELEASE_ID` | 対象artifactを特定できるcommit SHA |
| `VITE_WEB_VITALS_SAMPLE_RATE` | 未指定時は`1`。必要時だけ`0`から`1`の範囲で設定 |

`VITE_WEB_MEASUREMENT_ENABLED`は使用しない。  有効なGTM IDを持つdeploy artifactでは、同意状態、認証状態、route種別に関係なくGTMを読み込む。  local、未知environment、不正なrelease、GTM ID欠落は誤設定として起動しない。

## 常時発火contract

- Google tagとClarity tagは、GTMの初回`gtm.js`で全documentに一度だけ起動する。Consentやrouteを条件にしたblocking triggerを置かない。
- GA4のpage viewは、ApplicationのCustom Event `page_view`だけを発火元にする。Google tagの`send_page_view`とEnhanced Measurementのbrowser history page viewは無効にし、初回とSPA遷移の二重計測を防ぐ。
- GA4 event tagは`page_view`の`route_family`、`app_environment`、`release_id`だけを受ける。`select_content`と`web_vital`も、同名のCustom Eventと登録済みparameterだけを受ける。
- `route_family`と`document_route_family`は`src/domains/webMeasurement/routePolicy.ts`の有限値だけを受ける。未知値ではtagを発火させない。
- Clarityは同じdocumentのSPA遷移中に再初期化しない。URL parameter masking、Strict masking、閲覧権限、保持期間をproject側で管理する。

GoogleはSPAで手動page viewとEnhanced Measurementを併用すると重複するため、発火元を一つに固定する。[GA4 page view](https://developers.google.com/analytics/devguides/collection/ga4/views)

GA4へ渡すpage contextを有限値へ閉じる場合は、次の値を明示し、browser既定値へfallbackさせない。

| GA4 parameter | GTMで設定する値 |
|---|---|
| `page_location` | `https://shiftori.app/__measurement/<route-family>`へ写像したsynthetic URL |
| `page_referrer` | `https://shiftori.app/__measurement/referrer-not-collected` |
| `page_title` | `shiftori:<route-family>` |

ApplicationのdataLayer eventはquery、hash、raw URL、raw referrer、title、動的ID、token、OAuth値、氏名、連絡先、店舗名、組織名、自由入力、`user_id`を含まない。  GTM・GA・ClarityがbrowserやDOMから独自取得する値には、このserializerの制限は及ばない。

## 全route計測のSecurity確認

全routeには、`/manager-invite`、`/shifts/submit`、`/shifts/view`、`/legal/staff/consent`、`/line/callback`、`/sso-callback`など、tokenやOAuth値をURLに持つ認証前画面が含まれる。  Dashboard、店舗、スタッフ、ShiftBoardなど、業務情報を表示する認証後画面も含まれる。

ClarityのURL parameter maskingはpage URLのparameterを隠す補助防御であり、referrerやclicked URLには適用されない。  Strict maskingもURL credentialを無効化する仕組みではない。[Clarity FAQ](https://learn.microsoft.com/en-us/clarity/faq)  [Clarity masking](https://learn.microsoft.com/ja-jp/clarity/setup-and-installation/clarity-masking)

外部設定では少なくとも次を確認する。

- capability query名とOAuth query名をClarityとGA4のredaction対象にする。
- ClarityをStrict maskingとし、recordingを閲覧できるroleを最小化する。
- GA4のUser-ID、user-provided data collection、Google Signals、Ads連携、cross-domainを、別判断なしに有効化しない。
- GA4とClarityの保持期間、削除手順、担当者を記録する。
- Tag Assistant、GA4 network、Clarity recordingで、想定外のcredential・個人情報・業務情報がないか代表routeごとに確認する。

GA4のdata redactionとClarity maskingはbest-effortの補助防御であり、収集範囲に関する判断の代わりにしない。[GA4 data redaction](https://support.google.com/analytics/answer/13544947?hl=en)

## Preview検証

外部providerへ接続するPreview確認では、対象container、property、stream、project、releaseを先に記録する。  自動E2Eは第三者通信をstubするため、GTM loaderとdataLayer contractまでしか証明しない。

1. 同意値を保存していない新しいbrowser contextでTOPを開き、GTM、Google tag、Clarity tagが各一度だけ起動することを確認する。
2. ログイン、Dashboard、組織・店舗、スタッフ、ShiftBoard、法務ページを確認し、各direct loadで同じtagが起動することを確認する。
3. token・OAuth値を含むsyntheticなCapability・callback URLを確認し、計測が起動することと、dataLayer eventにはquery、token、raw URL、動的IDがないことを確認する。
4. SPA遷移ごとにGA4 `page_view`が一件だけ増え、GTMとClarityを再初期化しないことを確認する。queryだけの変更ではApplication `page_view`を増やさない。
5. GA4 requestのpage contextが設定したsynthetic値になり、DebugViewでも同じroute familyを確認する。[GA4 DebugView](https://support.google.com/analytics/answer/7201382?hl=en)
6. Clarity recordingでmasking、clicked URL、referrer、DOM、Console、Networkを確認し、想定した収集範囲と一致することを確認する。
7. ad blocker、GTM・GA・Clarity障害時も、画面表示、フォーム送信、navigationが失敗しないことを確認する。

GTMのWorkspace Previewはdraft containerをpublish前に確認できる。[Tag Manager Preview](https://support.google.com/tagmanager/answer/6107056?hl=en)

## 初期設定と保持

- GA4のevent-level data retentionは2か月を初期値とし、延長は分析目的と法務判断を別途記録する。[GA4 data retention](https://support.google.com/analytics/answer/7667196?hl=en)
- key eventは重複率と欠測率を確認してから必要な少数だけ指定する。
- Clarityの保持、masking、閲覧role、project削除手順を確認記録へ残す。
- 環境ごとにcontainer、GA4 property、web data stream、Clarity projectを分離する。

## Publishとrollback

Preview結果へcontainer version、property、stream、project、release、時刻を記録してからpublishする。  公開後は同じreleaseで最小のProduction確認を行い、[リリース状態](release-status.md)へ証跡を残す。

禁止値、想定外のrecording、重複page view、製品操作への影響を検出した場合は、次の順で停止する。

1. GTM containerでGoogle tagとClarity tagを停止し、安全なversionをpublishする。
2. application loader自体を止める必要がある場合は、対象environmentの`VITE_GTM_ID`を外して再build・deployする。
3. 収集済みdataに禁止値がある場合は、provider、event、parameter、期間を特定し、GA4・Clarityの削除を別の承認手順で行う。
4. 原因をapplication、container、property、Clarity projectへ分けてから再開する。

停止用feature flagはない。  GTM IDの変更は次のartifactにだけ反映されるため、即時停止はcontainer publishを優先する。

## 確認記録

一回の確認に次を残す。

- source：GTM Preview、GA4 DebugView、Clarity、browser network。
- target：container、property、stream、project、origin、route family。
- time：取得日時、対象期間、timezone。
- slice：device、environment、filter、認証状態。
- quality：sample、欠測、ad blocker、重複率。
- release：commit SHAとartifact。
- result：Repository implemented、External configured、Production observedのどれか。

token、credential、個人情報、Preview共有URL、外部管理画面の公開URLは文書へ保存しない。
