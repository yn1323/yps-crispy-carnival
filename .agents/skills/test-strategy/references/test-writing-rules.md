# テストの書き方ルール

このファイルは、`doc/rules/testing-strategy.md` を読んだ後に使う実装時の細則。
方針や層の分担は doc を正とし、ここではテストコードを書く時の判断、観点、レビュー基準を扱う。

## 目次

- 変更時のテスト判断
- Full Regression の契約マップ
- ファイル種別ごとの書き方
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

## ファイル種別ごとの書き方

テストファイルの種別ごとの書き方は `.claude/rules/` を正本とする。
各ファイルは、対象のファイルを読み書きした時点で自動的に読み込まれる。
対象のファイルを開く前にテストを設計する場合は、該当するファイルを先に読む。

| 対象 | 正本 | 読み込まれるファイル |
|---|---|---|
| Storybook / Behavior Test、VRT | `.claude/rules/stories.md` | `**/*.stories.tsx` |
| Logic UT、Frontend Unit | `.claude/rules/frontend-tests.md` | `src/`と`scripts/`の`*.test.ts`、`*.test.tsx` |
| Convex Function Test、Convex Scenario Test | `.claude/rules/convex-tests.md` | `convex/`の`*.test.ts` |
| Assertion の完全性 | `.claude/rules/test-assertions.md` | すべての`*.test.ts`、`*.test.tsx` |

## E2E

E2Eは、ブラウザ、認証、フロントエンド、実バックエンドを結ぶ主要導線を検証する。
core E2Eは、エラー系を除くハッピーパスを機能ごとに一契約ずつ持ち、各契約で前の機能の結果を次の機能で使う受け渡しを一つ以上確認する。
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
- アクセシビリティ専用suiteやaxe走査は追加しない。この方針をUIのrole、label、accessible nameや通常の機能契約を省く理由にせず、利用者の操作を表すselectorは維持する。
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
- seedは前提状態だけを作り、その契約の受け渡しにあたる操作（店舗設定の変更、募集作成、提出など）はseedで代替せず画面から行う。
- E2E専用の`convex/testing.ts`関数は`internalMutation`または`internalAction`にし、状態を変える前に`assertE2EHelpersEnabled`を呼ぶ。対象の組織、店舗、人物は、同じactorのseedが作ったものであることを関数内で確認する。
- 通知不達などの失敗状態は、本番の記録処理と同じ関数を呼んで作る。documentを直接insertしてschemaや表示条件とずらさない。
- provider代替seedは、画面で発行したtokenを本番と同じ検証・確定処理へ通す。偽のprovider IDはworkerと実行ごとに一意にし、実在IDと衝突しない接頭辞を付ける。
- メールアドレス、申請者、店舗は実行ごとに一意にし、IP単位のrate limitのように一意化できない上限にburn-inが当たる場合は、本番の上限値を変えず対象keyだけを`DEBUG_MODE`で戻すE2E専用関数を検討する。
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

- 外部サービスの実配送、Clerkの認証画面そのもの、LINE Loginの画面とcode交換、ピクセル単位のUIを通常E2Eで検証しない。
- `DEBUG_NOTIFICATION_DELIVERY_MODE`などdeployment全体に効く設定を、E2E実行中に切り替えない。
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
- E2Eを削減した場合、契約IDの移管先、logout後の認証境界、feature flagのenabled条件を説明できるか。
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

ユーザーからテスト観点の指摘を受けたら、このファイル、`.claude/rules/`、`doc/rules/testing-strategy.md` を更新対象にする。

- Story、Logic UT、Frontend Unit、Convexのテスト、assertionの細かい書き方は、「ファイル種別ごとの書き方」の表にある正本へ追記する。
- E2Eの書き方、fixture の使い方、レビュー観点はこのファイルへ追記する。
- テスト層の分担、実行方針、正式な判断基準に関わる内容は `doc/rules/testing-strategy.md` にも反映する。
- どちらにも関係する場合は、doc に方針、このファイルに実装時の具体例を書く。
- ユーザー指摘と既存記述が矛盾する場合は、古い記述を残さず更新する。
