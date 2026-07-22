# テスト方針

## 目的

このドキュメントは、YPS のテストをどの層に分け、どの粒度で書くかを定義する。特に、E2E では遅すぎ、フロントエンドのユニットテストでは狭すぎる業務フローを、Convex Scenario Test で検証する方針を明確にする。

## 運用

- このドキュメントはテスト方針の Source of Truth として扱う。
- ConvexのCapability、durable workflow、データ寿命の設計契約は `doc/rules/convex-design-strategy.md` を参照し、このドキュメントで検証層へ対応付ける。
- 実装時の細かいテストコードの書き方、Storybook play function、VRT、Convex Scenario Fixture、E2E Page Object の具体ルールは `.agents/skills/test-strategy/` を参照する。
- テスト観点、テストケース、テストコードの書き方についてユーザーから指摘を受けた場合は、実装修正だけで終わらせず、このドキュメントと `.agents/skills/test-strategy/` の両方を更新対象にする。

## 基本方針

- テストは「速く細かいもの」と「遅いが実環境に近いもの」を分ける。
- TypeScriptのテストファイル名は`*.test.ts`または`*.test.tsx`に統一する。jsdomやDOM APIを使う場合は、ファイル単位で実行環境を指定する。
- 複雑な DB 状態遷移は E2E に寄せすぎず、Convex Scenario Test で厚く見る。
- E2E は画面・認証・フロントエンドと実 Convex backend の接続確認を中心にする。
- same-repositoryのdevelop向けopen PRでは、exact PR headの認証付き`@release` Full Regressionと、Cloudflare PR Previewの公開5routeを確認する`@deployed` Smokeを実行する。fork PR、developからmainへのPR、`release.yml`では認証付きFull Regressionを実行しない。same-repositoryへpushできるactorをcredential付きPR workflowの信頼境界内とする。
- E2EのブラウザprojectはChrome系に限定し、Desktop ChromeとMobile Chromeの代表導線を確認する。
- スタッフの提出方式を追加・変更した場合は、対応する全方式について「初回提出、再編集・再提出、管理者による割当編集、下書き保存、reload後の永続化、確定通知、スタッフ閲覧」までを `@release` の一気通貫シナリオで保証する。
- magic link経由のスタッフ提出と閲覧は管理者のstorageStateを持たない別contextで確認し、再提出で追加・取り消した内容の両方を管理者画面と確定後のスタッフ画面で検証する。
- すべての分岐を同じ層で網羅しない。境界値は Logic UT / Function Test、業務状態遷移は Scenario Test、画面の完了確認は E2E に分担する。
- Full Regressionでは、利用中のpublic functionとHTTP routeをFunction Testで直接守り、複数API後の状態・永続化・通知・capability遷移をScenario Testで守る。E2Eの本数だけを増やして代替しない。
- E2Eの主要シナリオはScenario Testの発見元として使うが、同じ手順を複製しない。実ブラウザ接続はE2E、単一API境界はFunction Test、業務状態遷移はScenario Testへ契約を分解する。
- 不在、一意性、対象集合、旧capabilityの失効が契約なら、対象範囲を絞った完全一致と件数で保証する。部分一致や存在確認だけで完了扱いにしない。
- VRT対象Storyに最初から表示される静的な見出しや文言はVRTへ委ね、存在確認だけのBehavior Testを重複させない。Behavior Testは操作後に生じる表示・非表示・状態・件数の変化を保証する。
- 共有schemaの境界値は定義元で一度だけ検証し、フォーム側ではresolver接続、submit抑止、payload、状態遷移を保証する。
- `apps/analytics-dashboard/` は本人だけが使う内部BIのため、自動テストとFull Regressionの対象外とする。新しいテストを追加・維持せず、`pnpm analytics:lint`、`pnpm analytics:type-check`、`pnpm analytics:build`で確認する。

## テスト種別

| 種類 | コマンド/場所 | 目的 | 書くこと | 書かないこと |
|---|---|---|---|---|
| Logic UT | `pnpm test:logic`, `src/**/*.test.ts`, `src/**/*.test.tsx` | 純粋ロジックの退行検知 | 日付、時刻、配列加工、schema、表示変換、フォーム固有の純粋validation | DB、React表示、Convex接続 |
| Frontend Unit | `pnpm test:logic`, `*.test.ts`または`*.test.tsx`の先頭でjsdom環境を指定 | jsdom上のフロントエンド契約確認 | React hook、DOM API、Visual Viewport、listenerとcleanup、同期ガード、mutation引数生成 | component全体の表示、実認証、backend認可、DB永続化 |
| UI Component Test | `pnpm test:ui`, `*.stories.tsx` | Storybook 上の表示・軽い操作確認 | 代表状態、空/エラー/長文状態、重要な操作の play test | 業務フロー全体、DB状態検証 |
| Behavior Test（振る舞いテスト） | `pnpm test:ui`, `*.stories.tsx` の play function | Storybook 上でユーザー操作後の状態遷移を保証する | 押せる、進める、操作後にエラーや確認状態が出る、表示・件数が変わる、SP/PC固有操作、日付・入力の重要エッジケース | 初期表示の静的文言だけの確認、DB状態検証、API副作用、実認証、ピクセルパーフェクトな見た目差分 |
| VRT | Storycap testrun + RegSuit / Storybook | 見た目差分検知 | 代表パターン、variants、状態別Story、静的文言、長文、レイアウト | ロジック検証、業務状態遷移 |
| Convex Function Test | `pnpm test:convex`, `convex/{useCase}/*.test.ts` | query/mutation/action/HTTP Action単体の契約確認 | 認証、認可、IDOR、論理削除、返り値制限、HTTP method・body・CORS・署名・replay、副作用、空データ | 複数ドメインをまたぐ長い業務フロー |
| Convex Scenario Test | `pnpm test:convex`, `convex/_scenario/*.test.ts` | 複雑な業務状態遷移の検証 | 複数 mutation/query の連続実行、集計、スナップショット、最終DB状態、エッジケース | ブラウザ操作、見た目、実 Convex deployment 接続 |
| E2E | `pnpm e2e`, `e2e/scenarios/*.test.ts` | 実 frontend + 実 Convex backend の最終結合確認 | 主要ハッピーパス、認証、画面遷移、ユーザーに見える成功状態、重要通知の受付・CTA、リリース前の復旧導線 | DB細部の総当たり、全validation分岐、ピクセルパーフェクト、外部サービスの実配送 |

## Full Regression の契約マップ

大規模リファクタ前のFull Regressionは、テスト件数ではなく次の対応関係を作って監査する。

1. frontend、E2E、他のConvex関数から利用中のpublic query / mutation / actionと、`convex/http.ts`へ登録したHTTP routeを列挙する。
2. 各public APIとHTTP routeについて、認証、認可、店舗境界、論理削除、token状態、正常DTOまたはresponse、副作用を直接見るFunction Testを対応付ける。
3. `@smoke` / `@release` E2Eから、複数API後のDB状態、通知、snapshot、旧新link/sessionの契約を抽出し、Scenario Testを対応付ける。
4. 実ブラウザ、認証provider、frontend/backend接続だけをE2E固有の保証として残す。
5. 利用箇所がないpublic APIまたはHTTP routeは、既存形状をテストで固定する前に削除またはinternal化を検討する。

各契約は、最も速く安定して検証できる1つの層を主担当にする。
異なる層で同じ業務導線を扱う場合も、Function Testは単一API境界、Scenario Testは状態遷移と永続化、E2Eは実接続という別の失敗を検知する。

## Convex Scenario Test

Convex Scenario Test は、`convex-test` を使ってユーザーの複雑な業務シナリオを Convex 関数ベースで検証する。`convex-test` はテスト用の mock Convex backend と隔離DBを使うため、dev / preview / prod の実DBは使わない。

この層は、本プロジェクトにおける Convex IT 相当のテストとして扱う。主要な正常系だけでなく、業務フロー上で壊れると影響が大きいエッジケースまで検証する。

### 位置づけ

E2E 未満、Convex Function Test 以上の層として扱う。

```text
seed
  -> mutation A
  -> query で中間状態確認
  -> mutation B
  -> update/delete/論理削除
  -> query で最終DTO・DB状態確認
```

### 横断シナリオ

横断シナリオとは、1つの Convex useCase だけでは完結せず、複数の useCase をまたぐ業務フローのこと。

例:

```text
recruitment.mutations.createRecruitment
  -> shiftSubmission.mutations.submitShiftRequests
  -> shiftBoard.mutations.saveDraft
  -> shiftBoard.mutations.confirm
  -> dashboard.queries.getDashboardRecruitments
  -> notification.queries.getConfirmationEmailData
```

このようなシナリオは `convex/_scenario/` に置く。単一 useCase に閉じる契約確認は、従来通り `convex/{useCase}/queries.test.ts` や `convex/{useCase}/mutations.test.ts` に置く。

### 配置

```text
convex/
  _scenario/
    {businessFlow}.test.ts
  _test/
    setup.test-helper.ts
    fixtures.ts
    assertions.ts
    scenarioBuilders.ts
```

`convex/_test/` は helper や fixture の置き場、`convex/_scenario/` はシナリオ本体の置き場とする。

### 粒度

- 大きな業務単位を `describe` にする。
- 派生シナリオを `it` に分ける。
- 1つの `it` は `seed -> 複数 mutation/query -> assert` まで一気通貫で検証する。
- 細かい validation 分岐や境界値は Function Test / Logic UT に任せる。
- ハッピーパスだけで終わらせず、後続の query / dashboard / 通知 / 集計に影響するエッジケースを同じ業務単位に含める。
- テスト名が提出、再送、閲覧、復旧を約束する場合は、その最終操作を実行し、公開queryまたはDBで最終永続化まで確認する。
- 通知では対象ID、outbox、dedupe、link、snapshotを対象範囲で完全一致させ、余計な対象や重複がないことを確認する。
- schedulerを含む一気通貫シナリオでは、手書き引数でinternal actionを直呼びせず、実際に予約されたqueueを進めて最終状態を確認する。
- capabilityを再発行するフローでは、古いlink/session/tokenが使えず、新しいものだけが動くことを確認する。
- 中断復旧を保証するシナリオでは、永続化された中間状態で処理を止め、通常のscheduler、worker、reaperから再開して最終状態を確認する。
- job、Outbox、capabilityの復旧では、最終状態だけでなく、重複、取りこぼし、古いleaseやtokenの拒否を完全一致で確認する。
- 削除と通知が競合するシナリオでは、enqueue後、claim後、外部送信直前から代表境界を選び、削除後に新しい配送が始まらないことを確認する。

例:

```ts
describe("シフト作成シナリオ", () => {
  it("募集作成から希望提出、確定まで完了できる", async () => {});
  it("下書き保存時点の提出済み状態を保持できる", async () => {});
  it("未提出スタッフがいる状態を正しく返す", async () => {});
  it("再提出すると古い希望が残らず最新状態になる", async () => {});
  it("削除済みスタッフは集計・表示対象から外れる", async () => {});
});
```

### Scenario Test に含めるエッジケース

Scenario Test では、入力値そのものの網羅ではなく、その入力や状態が複数 API 後の業務状態に影響するケースを扱う。
ハッピーパスだけでは、集計・通知・表示用 query の意味論が崩れた退行を拾えないため、各シナリオには代表正常系に加えて業務上重要な派生を含める。

判断基準:

- その状態が後続の query、dashboard、通知データ、集計、スナップショットに影響するなら Scenario Test に含める。
- mutation 単体の入力拒否で完結するなら Function Test に寄せる。
- ユーザー操作や見た目の確認が主目的なら UI Component Test / E2E / VRT に寄せる。
- すべての組み合わせは狙わず、業務上の意味が変わる代表値を選ぶ。

含める例:

- 未提出、全休み提出、再提出。
- 下書き保存後の再提出や、確定後の閲覧。
- 削除済みスタッフ、削除済み店舗、確定済み募集。
- 法務同意済み/未同意、提出時同意、同意リンクの使用済み状態。
- LINE 連携済み/未連携、follow/unfollow、通知チャネルに影響する状態。
- 店舗シフト時間変更後も既存募集のスナップショットが維持されること。
- open 募集がある状態でスタッフを追加したときの通知対象・提出依頼対象。
- 既存セッションや使用済みトークンがある状態で、スタッフ向け画面が継続/失効を正しく扱うこと。

含めない例:

- 必須項目、文字数、メール形式など mutation 単体で完結する入力 validation。
- IDOR、未認証、権限不足、rate limit など単一 API の契約確認。
- UI 表示、ブラウザ遷移、外部 LINE / Resend 送信。

## 網羅性の考え方

100% 網羅は狙わず、リスクベースで厚くする。

### Logic UT

- 境界値を細かく見る。
- 日付・時刻・タイムゾーンずれ・丸め・ソートは厚めに書く。
- React / Convex に依存しないコードを優先して切り出し、ここで検証する。

### Frontend Unit

- テストファイル名は`*.test.ts`または`*.test.tsx`に統一する。
- React hook、jsdom、DOM API、Visual Viewport、`localStorage`に依存するテストは、ファイル先頭に`// @vitest-environment jsdom`を記述する。
- Logic UTと同じく`pnpm test:logic`で実行する。
- listener登録とcleanup、状態変更、入力非破壊、access kindの分離を検証する。
- mutation引数の生成はここで確認してよいが、認証、認可、IDOR、永続化はConvex Function TestまたはScenario Testへ分ける。
- Submit系の同期ガードはhook単体に加え、代表componentのBehavior Testで実際に接続されていることも確認する。

### UI Component Test / Behavior Test / VRT

- UI の代表状態を Storybook に置く。
- VRT は自前運用（storycap-testrun + RegSuit）でキャプチャ数の制限はないため、コンポーネントの状態ごとに個別 Story を作成する。ボタン等の細かい UI 部品のみ Variants Story に集約してよい。
- 操作が重要な小さいコンポーネントは Interactive Story を分ける。
- Behavior Test は Storybook の play function で、ユーザー操作後の振る舞いを検証する。`expect` による明示的な期待値を書き、表示される要素は `findBy...` で待つ。
- Behavior Test は、日付境界、SP/PC差分、任意ステップ、エラー表示、確認画面など、画面だけで保証できる重要エッジケースを対象にする。
- VRT対象Storyに最初から表示される見出し、説明、ラベル、件数などは、存在確認だけのplay functionを付けない。操作対象をrole/nameで取得することは許可するが、同じ静的文言を別assertで重複確認しない。
- 操作後に初めて表示されるvalidation error、確認画面、成功・失敗状態、表示・非表示、件数変化はBehavior Testに残す。
- URL、status、error code、JSON-LD、検索対象データ、法務version、sanitize結果、個人情報のマスキングは、文字列自体が機械契約またはセキュリティ契約なのでVRTだけに委ねない。
- Behavior Test を追加・変更するときは、その Story を VRT 撮影対象にするかを最後に必ず判断する。振る舞いだけを見たい場合は `parameters: { screenshot: { skip: true } }` を付ける。見た目の退行も守りたい場合は、VRT対象として残すか、別の静的Storyに代表状態を切り出す。
- モバイルStoryはviewport指定と対応する`vrt-mobile1`または`vrt-mobile2` tagを同時に付ける。viewport指定だけではモバイルVRT projectへ選択されない。
- Storycap testrun + RegSuit では `pnpm vrt:capture` でVRT対象StoryのPNGを `vrt-actual/` に生成し、`pnpm vrt:compare` で `vrt-work/reg/` に差分レポートを作る。
- PRではbaseline欠落を成功扱いにせず、初回baseline作成は明示的なbootstrap操作に限定する。
- DB や業務フロー全体は検証しない。

### Convex Function Test

以下を優先して細かく見る。

- 未認証
- 権限不足
- 他店舗データ参照(IDOR)
- staff、session、shop、recruitment、tokenなど、関連レコード間の店舗整合性
- 論理削除済みデータの除外
- 空データ
- query の返り値が最小DTOと完全一致し、tokenや内部管理用fieldを含まないこと
- mutation 後の DB 副作用
- Magic Link の期限切れ・使用済みトークン
- capabilityのdigest保存、失効、用途違い、newest-only再発行
- 公開登録のgeneric response、bot proof、多層rate limit、拒否時の副作用ゼロ
- HTTP Actionのmethod、content type、body上限、CORS、署名またはservice credential、timestamp・event IDのreplay拒否
- 異常系でDB、event、scheduler、外部API呼び出しが増えないこと
- 通知、再送、短時間連打でschedulerやoutboxが重複しないこと
- Outbox claimのlease期限、再回収、古いclaim identityによる完了拒否
- retention境界時刻、pendingデータの除外、redact後に残す監査field
- schedulerへ予約するAPIのscheduled function名、args、対象範囲の件数

### Convex Scenario Test

1ユースケースにつき、代表シナリオ1本と壊れやすい派生1〜2本を目安にする。複雑な機能はそれ以上増やしてよいが、全組み合わせ網羅はしない。Convex IT 相当の層なので、正常系だけで終わらせず、未提出、再提出、論理削除、他店舗データ混入、期限切れ、既存データ互換など、業務上重要なエッジケースもここで扱う。

優先度:

1. 売上・運用に直結する主導線
2. 複数テーブルをまたぐ処理
3. 集計・スナップショット・論理削除が絡む処理
4. E2E で検証すると遅すぎる処理
5. 過去に壊れた、または変更頻度が高い処理

durable workflowを変更する場合は、次の契約を優先する。

- fanoutを途中で中断して再開しても、対象集合とdedupeKeyが完全一致すること
- worker停止後に期限切れleaseを回収し、provider idempotency keyが再試行でも変わらないこと
- 店舗またはスタッフ削除後に配送されず、`cancelled`を古いworkerが上書きしないこと
- retentionまたは店舗消去を複数batchで完走し、再実行しても結果が変わらないこと

### Assertion の完全性

- 「含まれる」だけが契約なら部分一致を使ってよい。
- 不在、一意性、対象集合、通知先、旧新capabilityが契約なら、対象範囲を絞り、安定fieldへ射影・sortして完全一致と件数を確認する。
- `arrayContaining`、`toContain`、`.some()`、`.find()`だけでは余計な対象や重複を見逃すため、完全性が必要なassertionの代わりにしない。
- テスト名の最も深い動詞まで実行してassertする。「提出できる」なら提出mutationと保存結果、「再送される」なら対象者と通知証跡まで確認する。

### E2E

- `@smoke` はPR headの認証付きFull Regressionに含める主要ハッピーパスとして扱う。
- Cloudflare PR Preview公開後に、TOP、機能、FAQ、使い方、お問い合わせの公開5routeを`@deployed` Smokeする。Smoke自体は認証情報とstorageStateを使用しない。
- same-repositoryのdevelop向けPR headで認証付き`@release` Full Regressionを実行し、売上・店舗運用・スタッフ通知に直結する状態遷移を広く確認する。fork PR、developからmainへのPR、`release.yml`では実行しない。
- credential付きPR workflowはbase repositoryとhead repositoryが同じことを検証する。fork PRへEnvironment Secretsを渡さず、`pull_request_target`でPR headのcodeやpackage scriptを実行しない。
- ユーザーが画面から完了できること、実 frontend と実 Convex backend がつながっていることを確認する。
- mutation 成功は、ユーザーに見えるトーストや表示状態で判定する。
- DB の細かい最終状態確認は Convex Scenario Test に寄せる。
- 通知は外部の実到着ではなく、画面操作から本物の action が呼ばれ、`notificationOutbox` の目的・channel・対象・dedupeとmagic link/CTAが整合するところまでを、E2E限定のredacted probeで確認してよい。
- 破壊的なE2E helperはE2E専用deploymentだけで有効化し、production deploymentでは設定ミスがあっても実行できないことをCIまたはFunction Testで確認する。
- `notificationFailureInbox` は失敗専用として扱い、正常通知の証跡に使わない。不達Dashboardでは `open -> retrying -> resolved/open` のユーザー可視な復旧導線を確認する。
- 実Resend/LINE到着は `@provider-canary` として通常E2Eから分離する。

### E2E スイート

| Suite | 実行タイミング | 主な対象 |
|---|---|---|
| `@smoke` | PR Full Regression内 | ログイン、募集、提出、下書き、確定、閲覧の最小主導線 |
| `@release` | same-repositoryのdevelop向けPR | 機能全体の主要状態遷移、復旧、削除、永続化 |
| `@notification` | `@release` 内で必須 | 製品が生成する通知目的ごとのoutbox・channel・CTA |
| `@security` | `@release` 内で必須 | 保護ページ、失効token、対象外、削除済み、代表IDOR |
| `@mobile` | `@release` 内で必須 | スタッフ提出・閲覧・同意・登録の代表導線 |
| `@a11y` | `@release` 内で必須 | 主要ページのaxe自動検査 |
| `@deployed` | PR Preview／Developのデプロイ後 | Cloudflareへデプロイ済みURLの公開5route Smoke |
| `@provider-canary` | RC / 手動 | 隔離したメール・LINEアカウントへの最小実配送 |

PR Full Regression判定では、必須projectとscenario suite、skip 0件、想定外のflaky 0件、通知dry-run preflight成功、想定外のopen FailureInbox 0件、active outboxの重複dedupe 0件を必須とする。

open PRのE2E結果はVRTと別の固定markerコメントへ返し、Full Regression結果、Actions、Cloudflare PR Preview、`yps-crispy-carnival-e2e/pr-{N}`のhosting-pages予定URLを常に表示する。公開確認後だけ同じURLへcache-busting queryを付ける。hosting-pagesへ直接公開するのは固定schemaから生成したsanitized summaryだけとし、raw Playwright report、trace、動画、screenshot、console/error詳細、認証情報、storageStateは公開しない。raw artifactはActionsの非公開artifactとして扱う。

RCの本番リリースでは、隔離受信先によるprovider canary完了後、権限ある確認者がexact head SHA、時刻、環境、証跡URL、Turnstile・募集/確定のemail/LINE・LINE reply・問い合わせemail/Slackの全PASSを構造化attestationとして記録する。その検証後だけ`release:provider-canary-passed`ラベルを有効とし、追加push後は再実施する。

## 判断基準

迷ったら次の基準で置き場所を決める。

- 純粋関数だけで検証できる: Logic UT
- React hook、jsdom、DOM APIだけで検証できる: Frontend Unit
- UI の見た目や単体操作を確認したい: UI Component Test / VRT
- Storybook 上でユーザー操作後の振る舞い、エラー、確認状態、表示・件数変化を確認したい: Behavior Test
- 初期表示の静的文言、長文、改行、レイアウトを確認したい: VRT
- query/mutation/action/HTTP Action単体の契約を確認したい: Convex Function Test
- 複数の Convex 関数をまたいだ業務状態遷移を確認したい: Convex Scenario Test
- 実ブラウザ・認証・実 Convex backend との接続を確認したい: E2E

## 実行

変更範囲に応じて、以下を組み合わせて実行する。

```bash
pnpm lint
pnpm type-check
pnpm test:logic
pnpm test:ui
pnpm test:convex
pnpm e2e
```

Convex Scenario Test を追加・変更した場合は `pnpm test:convex` を実行する。

Codexで `pnpm lint`、`pnpm test:ui`、`pnpm e2e`、`pnpm vrt` など IPC や Playwright / ブラウザ起動を伴う検証を実行する場合は、最初から権限付きで実行する。
`EPERM`、ブラウザ起動不可、IPC/listen 失敗はテスト・lintの失敗ではなく、実行環境由来の問題として扱う。
