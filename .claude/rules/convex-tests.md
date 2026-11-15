---
paths:
  - "convex/**/*.test.ts"
---

# Convexのテストの書き方

単一のquery、mutation、action、HTTP Actionの契約はFunction Test、複数APIをまたぐ業務フローは `convex/_scenario/` のScenario Testで守る。
テスト層の選び方は `doc/rules/testing-strategy.md` と `test-strategy` を正本とする。

## Convex Function Test

Convex query/mutation/action/HTTP Action単体の契約を細かく見る。
`convex-test` のmock backendで高速に回す層。

優先観点:

- 未認証。
- 権限不足。
- 他店舗データ参照、IDOR。
- 論理削除済みデータの除外。
- 空データ。
- queryの返り値に不要フィールドが含まれないこと。
- mutation後のDB副作用。
- Magic Link、招待トークン、使用済み/期限切れ。
- 短時間連打や重複実行が問題になるmutationの冪等性。
- 関連レコード間の所属整合性。対象レコードだけでなく、staff、session、shop、recruitment、tokenの店舗が一致すること。
- 異常系でDB、event、scheduler、外部API呼び出しが増えないこと。

書き方:

- 各テストで独立した `convexTest` インスタンスを使う。
- 認証は `t.withIdentity()` を使う。
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
- テストデータは既存の `_test` helper またはinternal mutation経由で作る。
- エラーassertionは `.rejects.toThrowError(...)` を使う。
- 実DB、dev、preview、prodに接続しない。

避けること:

- 複数ユースケースをまたぐ長い業務フローをFunction Testに詰め込まない。
- `convex-test` のmock差異に依存する期待値を書かない。ID形式や実backendのエラーメッセージ詳細に依存しない。

## Convex Scenario Test

Convex Scenario Testは、E2E未満、Function Test以上の業務フローテスト。
E2Eで見ると遅すぎるDB状態遷移、通知、集計、dashboard表示用queryの意味論を守る。

含めるもの:

- 複数mutation/queryの連続実行。
- 下書き、再提出、確定、削除、通知予約などの状態遷移。
- dashboard、通知データ、集計、スナップショットへの影響。
- 既存データ互換、論理削除、他店舗混入、期限切れ。
- 売上・運用に直結する主導線と、壊れやすい派生。

書き方:

- `convex/_scenario/{businessFlow}.test.ts` に置く。
- 大きな業務単位を `describe`、派生シナリオを `it` にする。
- 各 `it` はScenario向けAAA（Arrange / Act / Assert）が読み取れる順序で書く。
- 長い業務フローでは `Act` / `Assert` の小さなまとまりを複数置いてよい。
- 繰り返し出るユーザー操作相当のAPI呼び出しは `convex/_test/scenarioFixtures.ts` に寄せる。
- Scenario Fixtureはpublic/internal Convex APIを呼ぶ薄いoperation wrapperにする。
- Fixtureには検証パターン、期待値、`expect(...)` を入れない。
- Fixtureはpublic/internal APIの生の結果を返す。statusのunwrap、期待外resultでの`throw`、暗黙の成功判定を隠さず、シナリオ本体でdiscriminated unionをassertする。
- DB直seedは前提状態作成だけに使い、通常のユーザー操作はFixture経由で表現する。
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

- 入力validationの全分岐をScenario Testに持ち込まない。
- ブラウザ操作、見た目、実配送、実認証をScenario Testで検証しない。
- 同じ操作wrapperが既にあるのにAPI直呼びを増やさない。
