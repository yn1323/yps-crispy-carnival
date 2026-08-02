# テスト方針

## 目的

この文書は、変更した契約をどのテスト層で守るかを定める。
テストコードの書き方、fixture、Storybook play function、Page Objectの手順は `test-strategy` が所有する。
実行コマンドとCIの現在値は `package.json`、Vitest設定、Playwright設定、`.github/workflows/` を正本とする。

## 基本原則

一つの契約には、最も速く安定して失敗原因を特定できる主担当層を一つ選ぶ。
別の層を追加するのは、実ブラウザ接続、DB状態遷移、見た目など、異なる失敗境界を検知するときに限る。

テストは実装手順ではなく、利用者またはAPIから観測できる契約を固定する。
内部の関数分割、workflowのstep名、静的な文言の総当たりを、変更しにくくする目的で固定しない。

不具合修正では、修正前の実装で失敗する回帰テストを先に作れるか検討する。
境界値、状態遷移、実接続、見た目を一つのテストへ詰め込まない。

意図した仕様変更が完了している場合は、現在の実装、機能文書、主担当層のテストから現行契約を確定してから、失敗した上位層テストを評価する。
古いE2Eを通すためだけに製品コードを以前の挙動へ戻さず、selector、待機、fixture、assertionを現行契約へ合わせる。
現行契約に反する製品回帰が確認できた場合は、E2Eの期待値を緩めて隠さない。

## テスト層

| 層 | 主な配置 | 守る契約 | 主担当にしないもの |
|---|---|---|---|
| Logic Test | `src/**/*.test.ts`、純粋処理の近く | 日付、時刻、配列、schema、業務判定、表示変換 | DB、React表示、Convex接続 |
| Frontend Unit Test | `src/**/*.test.tsx`、必要に応じてjsdom | hook、DOM API、listener、cleanup、同期ガード、引数生成 | component全体の表示、サーバー認可、DB永続化 |
| UI Component Test | `*.stories.tsx` | 代表状態、空、エラー、長文、軽い操作 | 業務flow全体、DB状態 |
| Behavior Test | Storybookのplay function | 操作後の表示、確認、件数、状態の変化 | 初期表示の静的文言だけの確認、API副作用 |
| VRT | VRT対象のStory | レイアウト、色、折返し、代表状態の見た目 | ロジック、業務状態遷移 |
| Convex Function Test | `convex/{useCase}/*.test.ts` | 単一query、mutation、action、HTTP Actionの入出力と副作用 | 複数ユースケースをまたぐ長いflow |
| Convex Scenario Test | `convex/_scenario/*.test.ts` | 複数API後の状態遷移、永続化、通知意図、復旧 | ブラウザ操作、見た目、実deployment接続 |
| E2E | `e2e/scenarios/*.test.ts` | 実frontend、認証、実Convex backendの接続と主要導線 | DB細部、全validation、pixel差分、外部サービスの実到着 |

## 配置の判断

次の順で主担当層を選ぶ。

1. 外部依存のない純粋な入力と出力ならLogic Testに置く。
2. React hookまたはDOMとの接続だけを確認するならFrontend Unit Testに置く。
3. componentの状態または操作後の表示ならUI Component TestかBehavior Testに置く。
4. 見た目の差分ならVRTに置く。
5. 単一のConvex APIまたはHTTP境界ならFunction Testに置く。
6. 複数APIをまたぐ業務状態ならScenario Testに置く。
7. 実認証、実ブラウザ、frontendとbackendの接続が失敗条件ならE2Eに置く。

同じシナリオを複数層へ複製しない。
Function Testは単一API、Scenario Testは状態遷移、E2Eは実接続というように、各層の失敗理由を分ける。

## Logic TestとFrontend Unit Test

日付、時刻、タイムゾーン、丸め、ソート、集計の境界値は純粋処理として厚く検証する。
React hook、Visual Viewport、storage、listenerを扱うテストは、必要な実行環境をファイル単位で明示する。

共有schemaの境界値は定義元で一度だけ検証する。
form側はresolver接続、submit抑止、payload、画面の状態遷移を守り、同じ境界値を重複検証しない。

二重送信の同期ガードはUnit Testで直接守り、代表componentで接続されていることをBehavior Testで守ってよい。

## UI Component Test、Behavior Test、VRT

Storyは代表状態を一つずつ識別できる形で用意する。
初回、空、読み込み、エラー、長文、モバイルなど、表示上の意味が変わる状態を選ぶ。

VRT対象Storyの初期表示に含まれる静的な見出しや文言は、存在確認だけのBehavior Testで重複させない。
操作後に初めて現れるvalidation error、確認、成功、失敗、表示、件数の変化はBehavior Testが守る。

URL、status、error code、JSON-LD、sanitize結果、個人情報のマスキングなど、文字列自体が機械契約またはセキュリティ契約である場合はVRTへ委ねない。

モバイルVRTの選択条件は `vitest.vrt.config.ts` を正本とする。
viewportを指定しただけで対象になると仮定せず、設定が使うtagも確認する。

## Convex Function Test

Function Testは、一つのpublic functionまたはHTTP Actionの境界を直接守る。

優先する契約は次のとおりである。

- 認証、認可、店舗境界、論理削除。
- runtime validator、返却DTO、入力件数と読み取り上限。
- token、session、capabilityの期限、用途、失効。
- HTTP method、content type、body上限、CORS、署名、credential、replay。
- DB更新、scheduler、Outboxなどの直接的な副作用。
- 拒否時にDB、event、scheduler、外部API呼出しが増えないこと。
- rate limit、dedupe、冪等性、leaseの単一状態遷移。

公開APIの返り値は、必要なfieldと完全一致する契約を優先する。
機密fieldがないことを、部分一致だけで済ませない。

## Convex Scenario Test

Scenario Testは、複数APIを経た後の業務状態を守る。
mock Convex backendと隔離DBを使い、dev、preview、productionの実DBへ接続しない。

```text
seed
  -> operation A
  -> 中間状態
  -> operation B
  -> 最終DTOとDB状態
```

単一ユースケースの契約はそのユースケースのFunction Test、複数ユースケースをまたぐflowは `convex/_scenario/` に置く。

入力値の全組合せではなく、後続の集計、通知、snapshot、公開queryの意味が変わる代表状態を選ぶ。
たとえば再提出、論理削除、期限切れ、古いcapability、既存データ互換、中断後の再開を扱う。

通知対象、Outbox、dedupe、snapshot、不在、一意性が契約なら、対象範囲の件数と集合を完全一致で確認する。
schedulerを含むflowはinternal actionを手書き引数で直呼びせず、実際に予約された処理を進める。

永続ワークフローでは、中断位置、lease失効、古いworker、重複、取りこぼし、削除との競合を代表境界から選ぶ。
最終状態だけでなく、古いleaseやtokenが拒否されることも守る。

## E2E

E2Eは、実ブラウザ、認証provider、frontend、実Convex backendの接続を守る。
主要導線の開始、画面遷移、利用者に見える完了状態を確認する。

core E2Eは、実ブラウザ境界が失敗条件になる少数の主要契約へ絞る。
Full Regressionを一つのE2E suiteとして表現せず、安定した契約IDを各主担当層へ対応付ける。

E2Eの削減または統合は、テスト件数の減少だけで正当化しない。
削除前に契約ID単位で、Function、Scenario、Behavior、VRT、Deployed Smokeのどこへ移管したかと、実ブラウザにしかない失敗境界を記録する。
認証E2Eを縮小しても、匿名で保護routeへ到達したときのredirectと、logout後に同じ保護routeへ再アクセスしたときの認証境界をcoreまたは独立browser smokeで維持する。
Function、Scenario、Behaviorだけでの代替は、logout後のブラウザ境界の完了条件にしない。

a11y検査をcore業務E2Eから分離する場合は、独立a11y smokeまたはStorybook accessibilityを主担当にし、見た目はVRT、操作後の状態はBehaviorへ対応付ける。
代替検査の担当と完了条件がないa11y検査の削除は、完了扱いにしない。

feature flagでskipされる契約はカバレッジ済みとみなさない。
公開条件が変わるときにenabled環境で実行する契約を持ち、閉状態の拒否や非表示はFunction、Scenario、Behaviorで別に守る。

DBの細部、全validation分岐、pixel差分は下位層へ分ける。
LINE、メール、決済providerなど外部サービスの実到着は、通常E2Eへ含めない。
実到着の確認が必要な場合は、対象、環境、判定、復旧を定めた人間向け運用手順として分ける。

通知対象、channel、件数、dedupe、Outbox、retry、最終失敗はFunction TestまたはScenario Testを主担当にする。
E2Eへ残す通知契約は、代表的なUI操作から匿名CTAや利用者に見える復旧導線へ到達できるブラウザ境界に限る。

並列E2Eでは、actor、認証状態、seed、cleanupの所有者をworker間で共有しない。
同じactorまたは同じ状態を使うprojectは同時実行せず、test順序やretryによってactorを入れ替えない。

retry成功を安定性の証拠にしない。
局所確認とburn-inはretryなしで初回成功を検証し、CIではmissing、duplicate、unexpected、理由のないskip、flakyを契約単位で失敗させる。
反復実行は終了codeだけで判定せず、各contract IDの反復数、project、初回成功、skipなしを結果JSONから検証する。

test timeoutは成功時にも消費する固定待機ではなく、失敗時の上限として扱う。
suite全体へ長い値を置かず、retryなしの通常worker数で得た実測にseed、外部境界、fixture cleanupの余裕を加えて、長い主要契約だけを局所校正する。

失敗診断は、secret、capability、credential、個人情報を含まない分類と計測値を基本にする。
trace、video、screenshot、HTML reportを公開する場合は、公開前に機密情報検査を通す。

認証付きCIの信頼境界、Previewの作成、worker数、対象tagは `.github/workflows/` とPlaywright設定を正本とする。
E2E固有の常設制約は `e2e/AGENTS.md`、実装手順は `test-strategy` が所有する。

### 遅延読み込みと事前読み込み

遅延mount、dynamic import、tabまたはDialogの表示条件、viewport進入で開始するAPIは、それぞれの開始条件と利用者に見える完了状態を契約にする。
「非表示中は購読しない」「初回表示で一度開始する」「再表示時に状態を保持またはresetする」はFrontend Unit TestまたはBehavior Testを主担当にする。
E2Eは内部の購読数やrequest順序を直接固定せず、実際のclick、tab選択、Dialog表示、scrollを行った後に、対象領域のLoadingと完了状態を確認する。

preloadは任意の最適化として扱い、hoverやfocusでmoduleまたはreadが先に始まっても、始まらなくても同じ利用者向け結果になることを前提にする。
E2Eの成功条件をpreload完了やrequest開始時刻へ依存させない。

Convexの継続購読やWebSocketがあるため、通信全体の静止を画面完了の条件にしない。
固定時間、`networkidle`、任意のresponse待ちではなく、対象sectionのlandmark、見出し、操作可能状態、局所Loadingの消滅をweb-first assertionで待つ。

viewportで開始する領域は、対象を表示領域へ移す操作と、その領域固有の完了状態を一つのE2E stepとして扱う。
viewportの座標値やIntersection Observerの内部発火回数はFrontend Unit Testへ分ける。

通常E2Eでは、遷移や表示完了までの経過時間を固定閾値でassertしない。
CSR遷移の性能回帰は、正規化したrouteごとの計測、production buildのbundle分析、または性能専用の監視で扱い、機能E2Eの成否と分ける。
dynamic importの失敗時に局所Errorと回復操作を表示する契約は、代表的なBehavior Testを主担当にする。

## Full Regression

Full Regressionは単一のE2E suiteではなく、主要な失敗境界がすべて主担当層へ対応している状態を指す。

監査では次を対応付ける。

1. 利用中のpublic functionとHTTP routeを列挙する。
2. 単一APIの認証、認可、返却、直接副作用をFunction Testへ対応付ける。
3. 複数API後の永続化、通知、snapshot、capability遷移をScenario Testへ対応付ける。
4. 実ブラウザ、実認証、frontendとbackendの接続をE2Eへ残す。
5. 代表状態の見た目をVRTへ対応付ける。

利用箇所がないpublic APIは、形状をテストで固定する前に削除またはinternal化を検討する。
大規模な変更でも、静的文言や実装詳細の総当たりをFull Regressionの代わりにしない。

## CIと運用

workflow YAMLのstep名、job構成、埋込みscriptをLogic Testで固定しない。
workflowから独立した純粋処理へ切り出した場合だけ、その公開入出力をテストする。

core E2EのCI gateは、実行件数の下限だけでなく、期待する契約ID、project、skip、retry、最終statusを検証する。
同一commitの反復実行と初回失敗0件を確認し、異なるcommitの成功率からflake率を推定しない。

CI/CDを人が確認する手順は `doc/manual/ci-cd.md` を参照する。
テストコマンド、project、shard、tagの現在値は設定ファイルを正本とする。
