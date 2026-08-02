# テストの書き方ルール

このファイルは、`doc/rules/testing-strategy.md` を読んだ後に使う実装時の細則。
方針や層の分担は doc を正とし、ここではテストコードを書く時の判断、観点、レビュー基準を扱う。

## 目次

- 変更時のテスト判断
- Full Regression の契約マップ
- Logic UT
- Frontend Unit
- Storybook / Behavior Test
- VRT
- Convex Function Test
- Convex Scenario Test
- Assertion の完全性
- E2E
- 高リスク観点
- テストレビュー
- ユーザー指摘の反映

## 変更時のテスト判断

実装変更では、先に「何を保証したいか」を書き出す。
テスト層はファイルの場所ではなく、保証したい契約で選ぶ。
層と契約の対応は`doc/rules/testing-strategy.md`の表を正本とし、このリファレンスへ再掲しない。

既存テストの扱い:

- 既存契約が変わったなら、テスト期待値を新仕様へ更新する。
- 新しい契約、過去に壊れた挙動、レビューで不安が出た観点ならテストを追加する。
- 仕様から消えた契約、別層へ移した契約、実装詳細だけを守るテストは削除または縮小する。
- 共有schemaの境界値は定義元で一度だけ検証し、利用側で同じ入力表を複製しない。
- 本番コードから参照されないhelperは、将来利用の可能性だけを理由に実装とテストを維持しない。
- 失敗しているテストを、理由なく期待値だけ緩めない。先に仕様変更、テストドリフト、実装バグ、環境問題を切り分ける。
- GitHub Actionsのworkflow YAMLをparseし、step名、job順序、権限値、埋め込みscriptの部分文字列をLogic UTや専用の静的解析CIで固定しない。Action参照は既存workflowのversion参照と更新方法に従い、追従参照がないことをレビューする。workflowの実行契約はActions上のjob結果で検証する。再利用する純粋helperをworkflow外へ切り出した場合だけ、その公開入出力を通常のLogic UTとして検証する。

## Full Regression の契約マップ

大規模リファクタ前は、既存テストの本数ではなく、製品機能から守る契約を逆算する。詳細な棚卸し手順と表の雛形は `e2e-full-regression-rules.md` を正とする。

1. 機能ドキュメント、route、管理者・スタッフ・公開画面、通知目的から業務契約を列挙する。
2. 機能×テスト層のトレーサビリティ表を作り、P0契約の未分類をなくす。
3. 利用中のpublic query、mutation、action、HTTP routeと、複数API後の状態、通知、snapshot、実ブラウザ接続を契約として列挙する。
4. 各契約を`doc/rules/testing-strategy.md`の主担当層へ対応付け、異なる失敗境界だけを別層で補う。
5. 利用箇所がないpublic functionまたはHTTP routeは、テストで固定する前に削除またはinternal化を検討する。

同じユーザーストーリーを各層へ丸ごと複製しない。
たとえば「スタッフを復帰させて新しいlinkから希望提出できる」は、link発行APIの境界をFunction Test、対象外から復帰後の旧link失効・新link発行・提出永続化をScenario Test、匿名ブラウザで画面完了できることをE2Eへ分ける。

## Logic UT

対象:

- React / Convex / DOM に依存しない純粋ロジック。
- 日付、時刻、タイムゾーンずれ、丸め、ソート、正規化。
- Zod schema、フォーム固有 validation、表示変換。

書き方:

- 境界値を厚めに書く。最小、最大、ちょうど境界、境界外を優先する。
- 日本語名の `describe` / `it` で業務意味が分かるようにする。
- 入力と期待値を読みやすく分ける。
- 実装の中間変数や private な分岐ではなく、公開関数の入出力を検証する。

避けること:

- DOM、React hook、Convex 接続を Logic UT に持ち込まない。
- ただの型定義、定数、追加ロジックのない schema 定義だけを過剰にテストしない。

共有schemaは、定義元のLogic UTまたはConvex Function Testで境界値を一度だけ検証する。
フロントエンド固有の追加制約がある場合だけ、その純粋validationをLogic UTへ置く。

## Frontend Unit

対象:

- React hook、jsdom、`window`、`document`、`localStorage`に依存する契約。
- Visual Viewport、event listener、cleanup、同期ガード、mutation引数生成。
- DOMを使うsanitizeやtracking helper。

書き方:

- テストファイル名は`*.test.ts`または`*.test.tsx`に統一する。
- jsdomが必要なファイルは、先頭に`// @vitest-environment jsdom`を記述する。
- Logic UTと同じく`pnpm test:logic`で実行する。
- frontendとbackendの責務を分け、引数生成やsession cacheだけを検証する。
- 認証、認可、IDOR、永続化は対応するConvex Function TestまたはScenario Testで保証する。
- listener登録とcleanup、enabled切り替え、malformed storage、access kindの分離を必要に応じて確認する。
- 遅延queryは、非表示中に`"skip"`または無効状態になり、表示条件を満たした時に正しい引数へ切り替わることを確認する。
- Intersection Observerやidle callbackで開始する処理は、対象callbackを制御して、開始前、開始後、cleanupを別々に確認する。
- Submit系の同期ガードは、hook単体だけでなく代表componentのBehavior Testでも接続を確認する。

避けること:

- ファイル名に`.frontend`など、実行環境を表す独自suffixを追加しない。
- jsdomが必要なテストで、ファイル単位の環境指定を省略しない。
- component全体の表示やユーザー操作をFrontend Unitへ寄せない。
- backendの権限境界をmock mutationの引数確認だけで保証したことにしない。

## Storybook / Behavior Test

Storybook は「UI状態の棚卸し」と「画面上の軽い振る舞い」を守る場所。

Story の作り方:

- UIを追加・変更したら、同階層の `index.stories.tsx` を作成または更新する。
- 代表状態、空状態、エラー状態、長文、権限差、モバイル差分を Story として置く。
- VRT はキャプチャ数の制限がない前提なので、状態ごとに個別 Story を基本にする。
- 小さい UI 部品だけは Variants Story にまとめてよい。
- VRT対象Storyに最初から表示される見出し、説明、ラベル、件数などは、静的な見た目と文言としてVRTへ委ねる。

play function の書き方:

- `storybook/test` から `expect`, `userEvent`, `within` を使う。
- Story から `vitest` の `expect` を import しない。
- `@storybook/test` の `fn()` は使わず、必要な callback は `() => {}` を直接渡す。
- 出現待ちは `findBy...` を優先する。
- `waitFor` は消滅、transition、件数変化など `findBy...` では意図が読みにくい時に限定する。
- 「押せる」「進める」「エラーが見える」「確認文言が出る」など、ユーザー操作後の見える結果を `expect(...)` で書く。
- カスタム helper が手動で throw するより、Testing Library の query と `expect` で意図を見せる。
- 初期表示の静的文言があることだけを確認するplay functionは書かない。`assertText`、`textContent.includes`、`getByText`だけで終わるplayは原則削除する。
- 操作によって初めて表示・非表示・更新されるvalidation error、確認画面、成功・失敗状態、件数変化はBehavior Testで検証する。
- lazy mountするtabまたはDialogは、利用者の操作で表示を開始し、`findBy...`で局所Loading後の内容を確認する。
- 再表示時の入力保持またはresetが製品契約なら、閉じる前の状態を作ってから再表示して確認する。
- dynamic importの失敗が利用者に見える場合は、代表Storyで局所Errorと再試行または再読み込みの導線を確認する。
- 操作対象を取得するためのrole/name指定はテスト手段として使ってよいが、同じ静的文言を別assertで重複確認しない。
- URL、status、error code、JSON-LD、検索対象データ、法務version、sanitize結果、個人情報のマスキングは、文字列自体が機械契約またはセキュリティ契約なのでVRTだけに委ねない。

避けること:

- DB状態や API 副作用を Storybook で保証しない。
- ピクセル差分を Behavior Test の assertion で代用しない。
- VRTで守れる初期表示の静的文言をBehavior Testで重複保証しない。
- 個人情報の非露出や機械可読データまで「静的文言」として削除しない。
- 表示される文言を無意味に曖昧な正規表現へ寄せすぎない。ユーザーに見える重要文言は明示する。

## VRT

VRT は見た目の退行を守る。
Storybook play function は振る舞い、VRT は見た目で役割を分ける。

判断:

- 見た目も守りたい Story は VRT 対象に残す。
- 振る舞いだけを見たい Story は `parameters: { screenshot: { skip: true } }` を付ける。
- play function の途中状態を撮りたい場合は、静的 Story に代表状態を切り出す。
- `position: fixed` の Header を含む縦長ページを full-page VRT で撮る場合は `parameters.vrt.releaseFixedHeader = true` を付ける。
- モバイルStoryはviewport指定と対応する`vrt-mobile1`または`vrt-mobile2` tagをセットで付ける。
- viewport指定だけではモバイルVRT projectの対象にならないため、tagなしを見逃さない。

実行と確認:

- VRT対象のStory、`parameters`、tagは変更契約に合わせて更新する。
- 通常の実装作業では、ローカルの`pnpm vrt`、screenshot capture、RegSuit compare、画像差分の目視確認を実行しない。
- VRTのbuild、capture、差分確認、承認、baseline更新はGitHub ActionsのVRT workflowへ委ねる。
- ユーザーがローカル実行を明示した場合、またはVRT workflow自体を診断する場合だけ、必要なVRT commandをローカルで実行する。
- 既定方針によりVRTをローカル実行しなかった場合は、完了報告で「VRTはCI確認方針のため未実行」と示し、環境失敗や検証漏れとして扱わない。
- CIで差分が出た場合は、意図した変更かを確認し、理由を説明できる状態にする。
- VRT 差分だけでロジックの正しさを判断しない。
- 静的文言の追加・削除・改行・長文崩れはVRTで確認し、同じStoryへ存在確認だけのplayを足さない。
- PRではbaseline欠落を成功扱いにせず、意図した差分だけを承認する。
- CIでの対象、承認、レポート公開、baseline更新は、現在の `.github/workflows/` と `.github/AGENTS.md` を正本とする。

## Convex Function Test

Convex query/mutation/action/HTTP Action単体の契約を細かく見る。
`convex-test` の mock backend で高速に回す層。

優先観点:

- 未認証。
- 権限不足。
- 他店舗データ参照、IDOR。
- 論理削除済みデータの除外。
- 空データ。
- query の返り値に不要フィールドが含まれないこと。
- mutation 後の DB 副作用。
- Magic Link、招待トークン、使用済み/期限切れ。
- 短時間連打や重複実行が問題になる mutation の冪等性。
- 関連レコード間の所属整合性。対象レコードだけでなく、staff、session、shop、recruitment、tokenの店舗が一致すること。
- 異常系でDB、event、scheduler、外部API呼び出しが増えないこと。

書き方:

- 各テストで独立した `convexTest` インスタンスを使う。
- 認証は `t.withIdentity()` を使う。
- 正常系と異常系をセットで考える。
- 所属境界は、関連レコードの一部だけ別店舗にした不整合fixtureを意図的に作り、各組み合わせを拒否できることを確認する。
- tokenやcapabilityは、未発行、期限切れ、使用済み、失効済み、削除済みstaff/shop、用途違いを必要な範囲で確認する。検証と確定が別APIなら、その間に状態が変わる競合も候補にする。
- queryの正常系は、公開契約に必要な最小DTOへ射影して完全一致させる。token、秘密情報、内部管理用fieldが露出していないことも確認する。
- public actionが外部APIを呼ぶ場合、拒否ケースではmock fetchが0回であることを確認する。正常系ではfollow状態、再利用、scheduled function完了まで必要に応じて検証する。
- 通知や再送は、対象者なし、対象者あり、rate limitを分け、schedulerやoutboxの件数が期待どおりで重複しないことを確認する。
- schedulerへ予約するAPIは、scheduled functionのname、args、対象範囲の件数を完全一致させる。予約された事実だけの存在確認で終えない。
- capabilityを発行するmutationでは、返したraw tokenと保存されたdigestを区別し、永続化不要なraw tokenがDBへ残らないことを確認する。
- 匿名登録では、存在状態ごとの外部DTOが同一であることと、bot proofまたはrate limit拒否時にrequest、event、schedulerが増えないことを確認する。
- HTTP Actionは`t.fetch()`でmethod、content type、body上限、CORS、署名またはservice credentialを検証し、timestamp・nonce・event IDがある場合はreplayと重複副作用を拒否することを確認する。
- leaseを使うworkerでは、未期限切れclaimの二重取得、期限切れclaimの再取得、古いclaim identityによる完了更新を別々に検証する。
- retention処理では、期限の直前と直後、pending行の除外、redact対象、保持する監査field、再実行時の冪等性を確認する。
- テストデータは既存の `_test` helper または internal mutation 経由で作る。
- エラー assertion は `.rejects.toThrowError(...)` を使う。
- 実DB、dev、preview、prod に接続しない。

避けること:

- 複数ユースケースをまたぐ長い業務フローをFunction Testに詰め込まない。
- `convex-test` の mock 差異に依存する期待値を書かない。ID形式や実 backend のエラーメッセージ詳細に依存しない。

## Convex Scenario Test

Convex Scenario Test は、E2E 未満、Function Test 以上の業務フローテスト。
E2E で見ると遅すぎる DB 状態遷移、通知、集計、dashboard 表示用 query の意味論を守る。

含めるもの:

- 複数 mutation/query の連続実行。
- 下書き、再提出、確定、削除、通知予約などの状態遷移。
- dashboard、通知データ、集計、スナップショットへの影響。
- 既存データ互換、論理削除、他店舗混入、期限切れ。
- 売上・運用に直結する主導線と、壊れやすい派生。

書き方:

- `convex/_scenario/{businessFlow}.test.ts` に置く。
- 大きな業務単位を `describe`、派生シナリオを `it` にする。
- 各 `it` は Scenario 向け AAA（Arrange / Act / Assert）が読み取れる順序で書く。
- 長い業務フローでは `Act` / `Assert` の小さなまとまりを複数置いてよい。
- 繰り返し出るユーザー操作相当の API 呼び出しは `convex/_test/scenarioFixtures.ts` に寄せる。
- Scenario Fixture は public/internal Convex API を呼ぶ薄い operation wrapper にする。
- Fixture には検証パターン、期待値、`expect(...)` を入れない。
- Fixtureはpublic/internal APIの生の結果を返す。statusのunwrap、期待外resultでの`throw`、暗黙の成功判定を隠さず、シナリオ本体でdiscriminated unionをassertする。
- DB 直 seed は前提状態作成だけに使い、通常のユーザー操作は Fixture 経由で表現する。
- シナリオ名が提出、再送、閲覧、復旧を約束する場合は、その最終操作を実行し、公開queryまたはDBで最終永続化まで確認する。途中画面用queryが成功しただけで完了扱いにしない。
- 状態遷移は `初期 -> 中間 -> 最終` の各契約を確認する。対象外化と復帰なら、対象一覧、旧session/linkの失効、通知なし、新linkの一意な発行、復帰後の実提出までをつなげる。
- 通知シナリオはscheduled/internal actionを完了させ、対象ID、outbox、dedupe、link、snapshotを対象範囲で完全一致させる。古いcapabilityが失敗し、新しいcapabilityが動くことも必要に応じて確認する。
- schedulerを含む一気通貫シナリオでは、手書き引数でinternal actionを直呼びせず、実際に予約されたqueueを進めて最終状態を確認する。予約境界だけをFunction Testで保証する場合とは分ける。
- fake timerを使う各テストは独立した`convexTest`で実行する。時刻固定はseed前、予約時刻の変更はAct直前に行い、非同期timer APIはawaitする。timer、env、global mockは`afterEach`または`try/finally`で必ず復元する。
- zero-delay jobだけを実行する場合は、jobを確認してから`vi.advanceTimersByTime(0)`と`await t.finishInProgressScheduledFunctions()`で完了を待つ。未来の催促や期限切れjobまで進めない。
- queue全体を将来時刻までdrainする契約だけ`finishAllScheduledFunctions(vi.runAllTimers)`を使い、実行後の失敗jobと未処理例外を放置しない。
- 中断復旧はinternal actionを都合よく直呼びせず、永続jobのcursor、lease期限、通常のschedulerまたはreaperを通して再開する。
- fanoutでは対象ID、outbox、dedupeKeyを完全一致させ、中断前後の重複と取りこぼしがないことを確認する。
- 外部送信後に状態更新だけ失敗するケースではexactly-onceを仮定せず、provider idempotency keyが再試行でも変わらないことを確認する。
- 削除競合ではterminalな`cancelled`状態と、削除後に新しく始まる外部API呼び出しが0件であることを確認する。

避けること:

- 入力 validation の全分岐を Scenario Test に持ち込まない。
- ブラウザ操作、見た目、実配送、実認証を Scenario Test で検証しない。
- 同じ操作 wrapper が既にあるのに API 直呼びを増やさない。

## Assertion の完全性

「存在する」だけで十分か、「余計なものがない」「一意である」「禁止対象がない」まで契約かを先に決める。

- 完全性、対象集合、不在、一意性を守る場合、`arrayContaining`、`toContain`、`.some()`、`.find()`だけで終えない。
- `not.toEqual(expect.arrayContaining([A, B]))` は、AかBの片方が漏れていても通るため、不在確認には使わない。
- 先に対象範囲をfilterし、契約fieldへ射影してsortし、`toEqual`と`toHaveLength`で完全一致させる。
- scheduler、outbox、link、sessionは`.find()`や`hasScheduledJob()`だけだと重複を見逃す。対象をfilterして0件または1件を明示する。
- public DTOは原則`toEqual`で固定する。DB documentのmetadataが不安定な場合は、安定fieldへ射影してから比較し、必要な箇所だけ`toMatchObject`を使う。
- `record?.field`を`toBeUndefined`、否定matcher、既定値へ流れる関数で検証する前に、親recordの存在を別にassertしてnarrowする。親ごと消えても通る偽陽性を作らない。
- テスト名の最も深い動詞までassertする。「提出できる」ならmutationを実行して保存結果を確認し、「再送される」なら対象と通知証跡を確認する。
- 完全一致ですでに集合の完全性と一意性を保証した場合、同じ集合への`not.toContain`や個別件数assertionを重ねない。

## E2E

E2Eは、ブラウザ、認証、フロントエンド、実バックエンドを結ぶ主要導線を検証する。
デプロイ済みURLのSmokeは公開接続の確認に絞り、認証付きFull Regressionと分ける。
現在の実行対象、ブラウザ、tag、Preview、credential、レポート公開は `.github/workflows/` とPlaywright設定を正本とする。
機能棚卸し、テスト層との対応付け、通知目的、ライフサイクルは `e2e-full-regression-rules.md` に従う。

### 失敗を分類する

- 失敗したE2Eだけを根拠に製品回帰と判断しない。現在の実装、機能文書、Story、主担当層のtestを確認し、製品回帰、test drift、共有状態、待機、環境・外部依存に分類する。
- 意図したfrontend変更によるtest driftでは、製品コードを以前の挙動へ戻さず、selector、待機、fixture、assertionを現行contractへ合わせる。
- 現行contractに反する製品回帰では、assertionを曖昧にする、待機を延ばす、retryを増やす方法で隠さない。
- 実ブラウザ境界を必要としないscenarioは、既存のE2E helperを拡張する前にLogic、Behavior、Function、Scenarioへ移す。

### スコープ縮小とbrowser-only contract

- E2Eを削除または統合するときは、件数をcoverageの根拠にせず、契約ID、移管先、残るbrowser-onlyの失敗境界を記録する。
- 匿名の保護route redirectとlogout後の保護route再アクセスは、coreまたは独立browser smokeで確認する。storageStateの生成やFunction、Scenario、Behaviorの成功だけをlogout契約の代替にしない。
- a11y検査をcoreから分離する場合は、独立a11y smokeまたはStorybook accessibilityを主担当として明示し、見た目をVRT、操作後の状態をBehaviorへ分ける。代替検査がない削除は未完了として扱う。
- feature flagでskipされたtestをpassまたはcoverage済みとして数えない。公開条件のenabled環境で実行するtestと、閉状態を守るtestを分けて記録する。

### Scenarioとselector

- E2Eにはファイル名と独立した安定contract IDを付け、scenario側はユーザーストーリー名と`test.step()`で利用者の操作を表す。
- `e2e/pages/`のPage Objectには、現在のcore scenarioが使う画面操作だけを置く。使われないmethodや将来用wrapperを維持しない。
- selectorは一意な`getByRole`とaccessible nameを優先し、次にlabel、安定した表示文言、`getByTestId`、最後にCSSを使う。
- `data-testid`は、利用者が認識できるrole、label、nameで一意に取得できない場合に限る。
- CSS class、Chakraの内部構造、`nth()`、広い部分一致を、画面構造の偶然へ依存するselectorとして使わない。
- 複数の正当な画面状態から次へ進む場合は、各状態をweb-first assertionで待ってから決定的に分岐する。例外をcatchして別selectorを試す方法で状態判定しない。

### 待機と非同期処理

- `page.waitForTimeout()`と固定秒待ちは使わない。locator、URL、操作可能状態、局所Loadingの消滅など、利用者に見える完了条件をweb-first assertionで待つ。
- `page.waitForLoadState("networkidle")`を完了条件にしない。ConvexのWebSocketや継続購読では、通信全体の静止が利用者向け完了状態と一致しない。
- lazy mountする領域は、click、tab選択、Dialog表示など実際の開始操作を行ってから、その領域固有のLoadingまたは完了landmarkを待つ。
- viewportで開始する領域は、対象locatorの`scrollIntoViewIfNeeded()`など意味のある操作で表示領域へ移し、座標や固定scroll量に依存しない。
- preload対象のrequestはclick前に始まり得るため、request順序や開始時刻をassertionにしない。非表示中の`"skip"`や開始回数はFrontend Unit Testで守る。
- browserから観測できないcapability発行などを待つ場合だけpollingを使う。pollingには総deadline、即時の初回probe、一回ごとのcommand timeout、成功時の即時終了を持たせ、deadline後の最終sleepを入れない。
- OCCだけを再試行する場合は、対象を分類して上限付きbackoffにする。認証、入力不正、設定不備、未知の失敗を同じretry loopへ入れない。
- suite全体を救う長いblanket timeoutを置かず、外部境界ごとに短いtimeoutとsafeな失敗分類を持たせる。
- test timeoutは固定sleepと区別する。成功時に満額を消費しない失敗上限として、retryなし・通常worker数の実測へseed、外部境界、fixture cleanupの余裕を加え、長いcontractだけに設定する。
- 通常E2Eで経過時間を固定閾値へassertしない。性能予算は専用の計測または監視へ分ける。

### Fixtureと並列実行

- 認証actorはworkerへ決定的に割り当て、test ordinal、実行順序、retryごとにrotateしない。
- 同じactorまたは同じ永続状態を使うprojectは同時実行しない。並列化は、actor、seed、cleanupの所有権が分離できる範囲だけで行う。
- seedとresetは対象actorまたはownerのデータだけを扱う。広い全件削除や別workerのデータを含むcleanupで隔離を作らない。
- test dataは再実行しても衝突しない一意性を持たせ、fixtureは期待値や暗黙の成功判定を隠さない。
- localeとtimezoneに依存するE2EはPlaywright設定で固定し、境界値そのものは注入可能な純粋処理のLogic Testで守る。

### 通知、capability、artifact

- 通知対象、channel、件数、dedupe、Outbox、retry、FailureInboxはFunction TestまたはScenario Testで完全一致させ、通常E2Eで集合をpollingしない。
- E2Eへ残すのは、代表的なUI操作から匿名CTAや利用者に見える復旧導線へ到達できるブラウザ境界である。
- 匿名CTAにcapabilityが必要な場合は、E2E専用gateを持つ最小helperから必要なtokenだけを取得する。token、引数、stdout、stderr、メールアドレスをerror、attachment、reportへ出さない。
- capability URLまたは個人情報を扱うtestでは、trace、video、screenshotを保存しない。診断はredact済みのcategory、duration、retry、project、worker、poll回数など、原因分類に必要な最小値へ限定する。
- report、trace、ZIP、attachmentを公開する前に、token、credential、メールアドレス、storage state、危険なarchive構造を検査し、検査が失敗したartifactは公開しない。

### Result gateと検証順序

- core E2Eの結果は件数下限だけで判定しない。期待するcontract IDとprojectを完全一致させ、missing、duplicate、unknown、unexpected、理由のないskip、flaky、retryを失敗にする。
- retryなしの反復実行も終了codeだけで判定しない。phaseごとに結果JSONを確定してから、各contract IDの反復数、project、初回成功、skip、flakyを機械検証し、次phaseによるreport上書き前にartifact privacyを検査する。
- mutation成功は内部DBではなく、トースト、画面遷移、利用者に見える最終状態で判定する。DBの完全な最終状態はScenario Testへ置く。
- デプロイ済みURLのSmokeは、対象routeのHTTP成功、固有landmark、主要CTA、URLを軽量に確認し、認証付きcore E2Eと分ける。
- 安定化確認は、対象testをretryなしの1 worker、通常worker数、retryなしの反復実行、同一commitのCI反復の順に広げる。
- CIでretryを診断用に残す場合も、retry成功をpassへ変換せずflakyとして失敗させる。異なるcommitの履歴をflake率の根拠にしない。

避けること:

- 外部サービスの実配送、Clerkの認証画面そのもの、ピクセル単位のUIを通常E2Eで検証しない。
- ガントチャートの精密なドラッグ座標や時間計算をE2Eに寄せない。必要ならLogic Testへ切り出す。

## 高リスク観点

このリポジトリでは、次の変更はテスト観点を厚めに見る。

- 日付、時刻、タイムゾーン、`YYYY-MM-DD`、深夜時間、丸め。
- Submit 系の二重送信、短時間連打、再送、冪等性。
- 認証、認可、IDOR、所属店舗の検証。
- Magic Link、招待、公開登録linkのdigest保存、期限、使用済み、失効、rotate、newest-only。
- HTTP Action、Webhook、service credentialのmethod、body上限、署名、CORS、replay、event dedupe。
- 論理削除済みデータの除外。
- 既存データ互換、スナップショット、schema、保存済みデータの形式変更。
- 通知outbox、fanout cursor、lease再回収、stale worker、削除競合、retrying、final failure。
- 個人情報を含むpayloadのretention、redaction、prune、店舗消去。
- Dashboard の `TODO`、通知失敗、スタッフ申請、シフト一覧のグルーピング。
- Storybook と E2E の UI 文言ドリフト。
- ArticleSite は個別記事 Markdown だけなら個別テスト不要。parser、frontmatter schema、一覧/カテゴリ/詳細レイアウトを変えた場合だけ既存 Story や `articleContent.test.ts` を更新する。

## テストレビュー

実装後に次を確認する。

- 変更した契約を、最も速く安定した層で保証しているか。
- E2E や broad integration test に寄せすぎていないか。
- E2Eを削減した場合、契約IDの移管先、logout後の認証境界、a11yの代替検査、feature flagのenabled条件を説明できるか。
- 正常系だけでなく、壊れると運用影響が大きい派生を見ているか。
- テスト名から業務上の意味が分かるか。
- assertion が「何を保証しているか」を読み取れるか。
- fixture や helper に期待値や検証ロジックを隠していないか。
- `findBy...` / web-first assertion で待てるところを、手動 polling や timeout にしていないか。
- 不要になったテストを残して、新仕様と矛盾させていないか。
- VRT対象Storyの静的文言をplay functionでも重複確認していないか。
- Behavior専用Storyへ`screenshot.skip`があり、同じ代表状態を必要に応じて静的Storyで撮影しているか。
- モバイルStoryへviewportとVRT tagの両方があるか。
- テストファイル名が`*.test.ts`または`*.test.tsx`で、DOM依存テストにjsdom環境指定があるか。
- 共有schemaの同じ境界値を定義元とフォーム側で重複検証していないか。
- `apps/analytics-dashboard/` に自動テストを追加・維持していないか。
- 実行できなかった検証があれば、理由が環境問題かコード問題かを明確に報告できるか。

## ユーザー指摘の反映

ユーザーからテスト観点の指摘を受けたら、このファイルと `doc/rules/testing-strategy.md` を更新対象にする。

- 細かい書き方、query の選び方、fixture の使い方、レビュー観点はこのファイルへ追記する。
- テスト層の分担、実行方針、正式な判断基準に関わる内容は `doc/rules/testing-strategy.md` にも反映する。
- どちらにも関係する場合は、doc に方針、このファイルに実装時の具体例を書く。
- ユーザー指摘と既存記述が矛盾する場合は、古い記述を残さず更新する。
