# テストの書き方ルール

このファイルは、`doc/rules/testing-strategy.md` を読んだ後に使う実装時の細則。
方針や層の分担は doc を正とし、ここではテストコードを書く時の判断、観点、レビュー基準を扱う。

## 目次

- 変更時のテスト判断
- Logic UT
- Storybook / Behavior Test
- VRT
- Convex Function Test
- Convex Scenario Test
- E2E
- 高リスク観点
- テストレビュー
- ユーザー指摘の反映

## 変更時のテスト判断

実装変更では、先に「何を保証したいか」を書き出す。
テスト層はファイルの場所ではなく、保証したい契約で選ぶ。

- 純粋関数、schema、表示変換、日付/時刻、ソートなら Logic UT。
- UI の状態一覧や見た目の退行なら Storybook Story / VRT。
- UI 上の操作後の振る舞いなら Storybook play function。
- Convex query/mutation 単体の契約なら Convex Function Test。
- 複数 API をまたいだ業務状態遷移なら Convex Scenario Test。
- 実ブラウザ、認証、frontend と backend の接続なら E2E。

既存テストの扱い:

- 既存契約が変わったなら、テスト期待値を新仕様へ更新する。
- 新しい契約、過去に壊れた挙動、レビューで不安が出た観点ならテストを追加する。
- 仕様から消えた契約、別層へ移した契約、実装詳細だけを守るテストは削除または縮小する。
- 失敗しているテストを、理由なく期待値だけ緩めない。先に仕様変更、テストドリフト、実装バグ、環境問題を切り分ける。

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

## Storybook / Behavior Test

Storybook は「UI状態の棚卸し」と「画面上の軽い振る舞い」を守る場所。

Story の作り方:

- UIを追加・変更したら、同階層の `index.stories.tsx` を作成または更新する。
- 代表状態、空状態、エラー状態、長文、権限差、モバイル差分を Story として置く。
- VRT はキャプチャ数の制限がない前提なので、状態ごとに個別 Story を基本にする。
- 小さい UI 部品だけは Variants Story にまとめてよい。

play function の書き方:

- `storybook/test` から `expect`, `userEvent`, `within` を使う。
- Story から `vitest` の `expect` を import しない。
- `@storybook/test` の `fn()` は使わず、必要な callback は `() => {}` を直接渡す。
- 出現待ちは `findBy...` を優先する。
- `waitFor` は消滅、transition、件数変化など `findBy...` では意図が読みにくい時に限定する。
- 「押せる」「進める」「エラーが見える」「確認文言が出る」など、ユーザー操作後の見える結果を `expect(...)` で書く。
- カスタム helper が手動で throw するより、Testing Library の query と `expect` で意図を見せる。

避けること:

- DB状態や API 副作用を Storybook で保証しない。
- ピクセル差分を Behavior Test の assertion で代用しない。
- 表示される文言を無意味に曖昧な正規表現へ寄せすぎない。ユーザーに見える重要文言は明示する。

## VRT

VRT は見た目の退行を守る。
Storybook play function は振る舞い、VRT は見た目で役割を分ける。

判断:

- 見た目も守りたい Story は VRT 対象に残す。
- 振る舞いだけを見たい Story は `parameters: { chromatic: { disableSnapshot: true } }` を付ける。
- play function の途中状態を撮りたい場合は、静的 Story に代表状態を切り出す。
- `position: fixed` の Header を含む縦長ページを full-page VRT で撮る場合は `parameters.vrt.releaseFixedHeader = true` を付ける。

確認:

- `pnpm vrt` は `storybook:build`、capture、RegSuit compare を通す。
- 差分が意図したものなら理由を説明できる状態にする。
- VRT 差分だけでロジックの正しさを判断しない。

## Convex Function Test

Convex query/mutation 単体の契約を細かく見る。
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

書き方:

- 各テストで独立した `convexTest` インスタンスを使う。
- 認証は `t.withIdentity()` を使う。
- 正常系と異常系をセットで考える。
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
- DB 直 seed は前提状態作成だけに使い、通常のユーザー操作は Fixture 経由で表現する。

避けること:

- 入力 validation の全分岐を Scenario Test に持ち込まない。
- ブラウザ操作、見た目、実配送、実認証を Scenario Test で検証しない。
- 同じ操作 wrapper が既にあるのに API 直呼びを増やさない。

## E2E

E2E は「実 frontend + 実 Convex backend + 認証済みブラウザ」の接続確認に絞る。
網羅ではなく、主要ハッピーパスがユーザーに見える形で完了することを保証する。

書き方:

- `e2e/pages/` の Page Object に画面操作を切り出す。
- シナリオ側はユーザーストーリー名のファイルにし、`test.step()` で区切る。
- セレクター優先順は `getByRole` / `getByText`、次に `getByTestId`、最後に CSS。
- `data-testid` はセマンティックなセレクターで取れない場合だけ使う。
- `page.waitForTimeout()` は禁止。`expect(locator).toBeVisible()` など web-first assertion で待つ。
- mutation 成功はトーストや画面の表示状態で判定する。
- DB の細かい最終状態確認は Convex Scenario Test に寄せる。

避けること:

- 外部サービスの実配送、Clerk の認証画面そのもの、ピクセルパーフェクトな UI を E2E で検証しない。
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
- Magic Link、招待トークン、期限切れ、使用済み、再発行。
- 論理削除済みデータの除外。
- 既存データ互換、スナップショット、schema / persisted shape の変更。
- 通知 outbox、retrying、final failure、FailureInbox、実配送ではなく受付状態。
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
- 実行できなかった検証があれば、理由が環境問題かコード問題かを明確に報告できるか。

## ユーザー指摘の反映

ユーザーからテスト観点の指摘を受けたら、このファイルと `doc/rules/testing-strategy.md` を更新対象にする。

- 細かい書き方、query の選び方、fixture の使い方、レビュー観点はこのファイルへ追記する。
- テスト層の分担、実行方針、正式な判断基準に関わる内容は `doc/rules/testing-strategy.md` にも反映する。
- どちらにも関係する場合は、doc に方針、このファイルに実装時の具体例を書く。
- ユーザー指摘と既存記述が矛盾する場合は、古い記述を残さず更新する。
