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

- 純粋関数、schema、表示変換、日付/時刻、ソートなら Logic UT。
- React hook、jsdom、DOM API、Visual Viewport、同期ガードなら Frontend Unit。
- UI の状態一覧や見た目の退行なら Storybook Story / VRT。
- UI 上の操作後の振る舞いなら Storybook play function。
- Convex query/mutation/action/HTTP Action単体の契約なら Convex Function Test。
- 複数 API をまたいだ業務状態遷移なら Convex Scenario Test。
- 実ブラウザ、認証、frontend と backend の接続なら E2E。
- `apps/analytics-dashboard/` は本人用の内部BIなので自動テストとFull Regressionの対象外。新しいテストを追加せず、既存テストの維持も要求しない。

既存テストの扱い:

- 既存契約が変わったなら、テスト期待値を新仕様へ更新する。
- 新しい契約、過去に壊れた挙動、レビューで不安が出た観点ならテストを追加する。
- 仕様から消えた契約、別層へ移した契約、実装詳細だけを守るテストは削除または縮小する。
- 共有schemaの境界値は定義元で一度だけ検証し、利用側で同じ入力表を複製しない。
- 本番コードから参照されないhelperは、将来利用の可能性だけを理由に実装とテストを維持しない。
- 失敗しているテストを、理由なく期待値だけ緩めない。先に仕様変更、テストドリフト、実装バグ、環境問題を切り分ける。

## Full Regression の契約マップ

大規模リファクタ前は、既存テストの本数ではなく、製品機能から守る契約を逆算する。詳細な棚卸し手順と表の雛形は `e2e-full-regression-rules.md` を正とする。

1. 機能ドキュメント、route、管理者・スタッフ・公開画面、通知目的から業務契約を列挙する。
2. 機能×テスト層のトレーサビリティ表を作り、P0契約の未分類をなくす。
3. 利用中のpublic query / mutation / actionとHTTP routeへFunction Testを対応付け、認証、店舗境界、論理削除、token状態、正常DTOまたはresponse、request制約、副作用なしを直接保証する。
4. 複数API後の状態、通知、snapshot、旧新capabilityはScenario Test、実ブラウザとfrontend/backend接続はE2Eへ分ける。
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

確認:

- `pnpm vrt` は `storybook:build`、capture、RegSuit compare を通す。
- 差分が意図したものなら理由を説明できる状態にする。
- VRT 差分だけでロジックの正しさを判断しない。
- 静的文言の追加・削除・改行・長文崩れはVRTで確認し、同じStoryへ存在確認だけのplayを足さない。
- PRではbaseline欠落を成功扱いにせず、意図した差分だけを承認する。

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

- 複数 useCase をまたぐ長い業務フローを Function Test に詰め込まない。
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

E2E は「実 frontend + 実 Convex backend + 認証済みブラウザ」の接続確認を中心にする。
develop向けPRの `@release` Full Regressionは主要ハッピーパスに加え、通知・復旧・モバイル・公開面・axe検査まで含める。developからmainへのPRと`release.yml`ではFull Regressionを再実行しない。
ブラウザprojectはChrome系に限定し、Desktop ChromeとMobile Chromeの代表導線を分けて確認する。
機能棚卸し、機能×テスト層のトレーサビリティ、通知目的の分類、方式別ライフサイクル、CI結果ゲートは `e2e-full-regression-rules.md` に従う。この節ではE2Eコードの実装規約を扱う。

書き方:

- `e2e/pages/` の Page Object に画面操作を切り出す。
- シナリオ側はユーザーストーリー名のファイルにし、`test.step()` で区切る。
- セレクター優先順は `getByRole` / `getByText`、次に `getByTestId`、最後に CSS。
- `data-testid` はセマンティックなセレクターで取れない場合だけ使う。
- `page.waitForTimeout()` は禁止。`expect(locator).toBeVisible()` など web-first assertion で待つ。
- mutation 成功はトーストや画面の表示状態で判定する。
- DB の細かい最終状態確認は Convex Scenario Test に寄せる。
- 通知E2Eでは、検証対象のmagic link、LINE link token、outbox、FailureInboxをテストhelperで人工生成しない。本番と同じUI操作・mutation・scheduled actionから生成された証跡を待つ。
- 通知のDB確認が必要な場合は、E2E環境だけで動くinternal testing APIから、目的、channel、対象ID、status、dedupe、CTA整合だけを返す。redacted通知probeは生メールアドレス、LINE userId、token、本文、provider error全文を返さない。画面遷移にtokenが必要な場合だけ、同じE2Eゲートを持つ専用token helperを分離して使う。
- 正常通知は `notificationOutbox`、retry/fallbackは `notificationDeliveryEvents`、最終失敗だけ `notificationFailureInbox` を見る。

避けること:

- 外部サービスの実配送、Clerk の認証画面そのもの、ピクセルパーフェクトな UI を通常E2Eで検証しない。実配送は隔離した `@provider-canary` に分離する。
- CSS クラスや Chakra の内部構造に依存しない。
- ガントチャートの精密なドラッグ座標や時間計算を E2E に寄せない。必要なら Logic UT に切り出す。

## Codex での実行権限

Codex sandbox では IPC、ブラウザ起動、ローカルサーバー接続が失敗しやすい。
次のコマンドは、Codexで実行する必要がある場合は最初から権限付きで実行する。

- `pnpm lint`
- `pnpm test:ui`
- `pnpm e2e`
- `pnpm vrt`
- その他 Playwright / ブラウザ起動 / storycap / ローカルサーバー接続を伴う検証

`EPERM`、ブラウザ起動不可、IPC/listen 失敗はテスト失敗と区別する。
コード修正で追いかける前に、実行環境由来の失敗として扱う。

## 高リスク観点

このリポジトリでは、次の変更はテスト観点を厚めに見る。

- 日付、時刻、タイムゾーン、`YYYY-MM-DD`、深夜時間、丸め。
- Submit 系の二重送信、短時間連打、再送、冪等性。
- 認証、認可、IDOR、所属店舗の検証。
- Magic Link、招待、公開登録linkのdigest保存、期限、使用済み、失効、rotate、newest-only。
- HTTP Action、Webhook、service credentialのmethod、body上限、署名、CORS、replay、event dedupe。
- 論理削除済みデータの除外。
- 既存データ互換、スナップショット、schema / persisted shape の変更。
- 通知outbox、fanout cursor、lease再回収、stale worker、削除競合、retrying、final failure。
- 個人情報を含むpayloadのretention、redaction、prune、店舗消去。
- Dashboard の `今やること`、通知失敗、スタッフ申請、シフト一覧のグルーピング。
- Storybook と E2E の UI 文言ドリフト。
- ArticleSite は個別記事 Markdown だけなら個別テスト不要。parser、frontmatter schema、一覧/カテゴリ/詳細レイアウトを変えた場合だけ既存 Story や `articleContent.test.ts` を更新する。

## テストレビュー

実装後に次を確認する。

- 変更した契約を、最も速く安定した層で保証しているか。
- E2E や broad integration test に寄せすぎていないか。
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
