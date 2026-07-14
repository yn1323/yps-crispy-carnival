# Convex 設計方針

## 目的

このドキュメントは、シフトリの Convex バックエンドで維持する設計契約を定義する。

個別機能の仕様は `doc/features/` とコードを正とし、このドキュメントでは認証境界、公開 API、非同期処理、データ寿命、運用設計の共通方針を扱う。

実装配置と技術的な書き方は `convex/AGENTS.md`、セキュリティは `doc/rules/security-strategy.md`、テスト層は `doc/rules/testing-strategy.md`、schema 変更は `convex-migration-helper` を併用する。

既存コードがこの方針と異なる場合、その実装を新規変更の前例にしない。
互換性、persisted shape、公開APIへ影響する修正は、実装計画とmigrationを分けて適用する。

## 設計の基本形

Convex 配下は Use-Case Slices + CQRS を維持する。

- API は DB テーブルではなく、利用者とユースケースで分割する。
- query、mutation、action は役割を分け、外部 API 呼び出しを mutation に混ぜない。
- query と mutation から `ctx.db` を直接使ってよく、全処理へ repository interface を挟まない。
- 共通層には、複数ユースケースで意味が同じ policy、validator、純粋 helper だけを置く。
- ファイルの大きさだけで全面再編せず、状態遷移や変更理由が異なる責務を局所的に分ける。

## 呼び出し主体と信頼境界

public functionまたはHTTP routeを作る前に、呼び出し主体を少なくとも次の一つへ分類する。
CapabilityをHTTP Actionで受ける場合など複数の境界に該当するときは、それぞれの検証契約を重ねる。

| 境界 | 権限の正または受付条件 | 主な用途 |
|---|---|---|
| authenticated | Clerk identity と `users` | 初回 setup、所属店舗一覧など、店舗未確定でも必要な処理 |
| manager | Clerk identity、active `shopMembers`、非削除 `shops` | 店舗単位の管理処理 |
| staff session | session、staff、shop、recruitment、access kind | スタッフの提出と閲覧 |
| public capability | bearer token の scope と状態 | magic link、登録、同意、LINE OAuth |
| anonymous HTTP | 権限なし。network metadata、bot proof、rate limitはabuse controlにだけ使う | 公開登録、問い合わせなどidentityを持たない受付 |
| provider / service HTTP | provider署名またはservice credential、event identity | LINE、Resend、内部BIなどの外部連携 |
| internal | Convex の internal function 境界 | cron、fanout、集計、migration、配送 worker |

店舗スコープの manager API は `shopId` を必須とする。

先頭の所属店舗へ暗黙にフォールバックできるのは、初回 setup や店舗選択の初期化など、対象店舗がまだ確定していない API に限定する。

店舗単位の role と permission は `shopMembers` を正とし、グローバル user role で店舗権限を代用しない。

## Public APIとHTTPの契約

public query、mutation、actionとHTTP Actionは、外部から呼べるAPIとして設計する。

各 API は少なくとも次を定義する。

- actor と認証方式
- 対象店舗と asset
- user-controlled な ID と取得後の所属検証
- public query、mutation、actionのruntime `args` validatorと`returns` validator
- 最小DTOまたは最小response
- 最大入力件数、返却量の契約、最大走査量またはread budget
- rate limit、冪等性、dedupe の要否
- DB 更新、scheduler、外部 API などの副作用
- 対応する Function Test または Scenario Test

HTTP Actionでは、method、path、content type、body上限、CORS、署名またはcredential、replayとevent重複の扱いも定義する。

HTTP routeはallowlistとして管理し、認証、bot proof、署名、request制約を検証した後だけinternal mutationへ状態変更を渡す。

生の `query`、`mutation`、`action` を使う public function は、匿名または capability 境界として意図したものだけに限定する。

許可するファイルを明示し、認証ラッパーの迂回が無制限に増えないよう CI または静的検査で確認する。

利用箇所がないpublic functionまたはHTTP routeは、互換性をテストで固定する前に削除し、必要な処理だけinternal化することを検討する。

## Capability の寿命

magic link、session、登録 URL、招待、法務同意、LINE 連携 token は、用途ごとに次の契約を決める。

| 項目 | 決める内容 |
|---|---|
| scope | shop、subject、recruitment、access kind、purpose |
| 保管 | raw token を再表示する必要がなければ digest を保存する |
| 有効期間 | `createdAt`、`expiresAt`、業務上の失効条件 |
| 使用回数 | single-use または reusable |
| 再発行 | newest-only または複数有効 |
| 無効化 | `usedAt`、`revokedAt`、version、rotation |
| abuse 対策 | token、IP、店舗、global の rate limit と試行上限 |
| 応答 | account、staff、申請状態を列挙できない外部応答 |
| 後処理 | 期限切れ、使用済み、失効済み record の保持期限と prune |

newest-only の capability は、発行と同じ transaction で同じ scope の古い未使用 token を revoke する。

検証と消費が別処理になる場合は、消費時にも最新 version と状態を再確認する。

不特定の利用者が使う登録フォームは、HTTP Action の body 上限、bot proof、多層 rate limit、店舗ごとの pending hard cap、rotation、revoke を組み合わせる。

既存、申請中、新規を外部応答で区別せず、承認権限は manager 境界に残す。

## Durable workflow

外部副作用や多数の対象へ fanout する処理は、mutation が永続的な処理意図を保存してから開始する。

scheduled action は外部副作用の実行手段であり、処理全体の進捗を保持する workflow として扱わない。

中断後の再開が必要な処理には、永続 job と次の情報を持たせる。

- `status`
- `cursor`
- `attemptCount`
- `nextRunAt`
- `processingStartedAt`
- lease または processing deadline
- operation epoch または version
- `lastErrorCode`
- `createdAt` と `updatedAt`

worker の状態遷移は、たとえば次の形で明示する。

```text
pending -> processing -> sent
                     -> pending
                     -> failed
                     -> cancelled
```

- claimは`nextRunAt <= now`など実行可能な`pending`またはretry対象だけを排他的に取得する。
- `processing`を再取得できるのはleaseが失効した場合だけとする。
- stale な `processing` は reaper が回収する。
- `markSent`、retry、failure は期待する status、lease、epoch が一致する場合だけ更新する。
- 外部送信には安定した operation ID 由来の idempotency key を使う。
- fanout は bounded batch で進め、cursor と完了状態を永続化する。
- action が記録を残す前に停止しても、未完了 job と最終成功時刻から検知できるようにする。

店舗削除や通知停止は `cancelled` を終端状態として扱い、削除開始後の enqueue を拒否する。

claim 後に削除状態が変わる競合へ備え、外部 API 呼び出し直前に店舗状態と operation epoch を再確認する。

外部 API 呼び出し開始後の完全な取り消しは保証できないため、削除時の in-flight 処理をどう扱うかも仕様に含める。

## データ寿命と監査

論理削除はアクセス停止の手段であり、個人情報の消去を完了したことにはならない。

永続テーブルごとに次を定義する。

- データの目的と owner
- tenant key
- active 期間
- retry、問い合わせ、監査のための保持期間
- 論理削除時の動作
- redact、anonymize、物理削除の条件
- backup 上の保持方針

通知 payload と監査 metadata は分離する。

送信後に不要になった宛先、本文、token URL、provider の raw error は、再送や調査に必要な期間を過ぎたら redact または削除する。

provider error は `provider`、`status`、`code`、`retryable` などの安全な分類値へ変換し、raw response body を保存しない。

権限変更、billing、店舗削除、スタッフ削除、募集削除、シフト確定、手動再送など、責任追跡が必要な操作は追記型 audit event を検討する。

audit event には actor、shop、action、target、occurredAt、correlation ID、安全な metadata を持たせ、不要な PII や document 全体を保存しない。

## Schema の不変条件

schema は保存形式だけでなく、業務上あり得る組み合わせを表す。

- actor や subject の種類で field が変わる場合は discriminated union を使う。
- both-or-neither を許さない optional ID の組み合わせを作らない。
- singleton や一意性は、`.unique()` と同一 transaction 内の write policy で守る。
- `v.optional()` は「業務上任意」「移行中」「未計算」のどれかをコメントや型で区別する。
- 移行中の optional と fallback には `TODO[narrow]`、対象 migration、完了条件を残す。
- 集計や snapshot の定義が変わる場合は、算出 version を保存して混在を検出できるようにする。

## Bounded read と集計

一覧と集計は、現在の件数ではなく増加後の上限を基準に設計する。

- index で tenant と主要条件を絞る。
- `paginationOpts.numItems` は初期page sizeの目標であり、reactive paginationの結果件数を保証するhard capではない。
- 異常に大きい`numItems`やread budgetはhandlerで拒否してよいが、検証した`numItems`を最大返却件数として扱わない。
- Convexのnative paginationでは`paginationOptsValidator`を使い、`endCursor`、`maximumRowsRead`、`maximumBytesRead`、`id`を失わないよう`args.paginationOpts`を変形せず`.paginate()`へ渡す。
- 固定件数の snapshot API と cursor pagination を同じ返却契約に見せない。
- 上限超過で正確性が失われる集計は、黙って正確値として保存しない。

全件集計が契約なら、write時に維持するcounterか、cursorと中間結果を永続化するboundedな集計jobを使う。
writeで保証された小さな上限がない限り、単一function内で全pageを読み切らない。

capped value が契約なら `isTruncated`、`lowerBound`、対象上限などを保存し、利用側もその意味を表示する。

digest table、document 分割、counter、sharding は、明確に unbounded な処理、既知の hot path、または Convex Insights の実測がある場合に導入する。

## Test helper の隔離

全件削除や seed のような破壊的 internal function は、internal であることだけを本番防御にしない。

- E2E 専用 deployment を固定する。
- production deployment では enable 設定を拒否する。
- deployment identity と明示 enable の二重条件を使う。
- 可能なら destructive helper を通常の production artifact から分離する。
- 読み取り probe と破壊的 command を同じ権限にまとめない。
- CI で production の禁止設定を検査する。

## 運用契約

次の状態を計測し、閾値と確認手順を決める。

- 最古の pending 経過時間
- processing lease 超過件数
- workflow と Outbox の backlog
- retry attempt 別件数
- cron、fanout、集計、migration の最終成功時刻
- token と session の期限切れ未処理件数
- webhook の署名不正、重複、処理失敗
- rate limit と bot proof の拒否件数
- 集計の truncation と version 混在

ログだけで判定せず、状態テーブルまたは安全な集計値から未完了処理を確認できるようにする。

## テストの分担

Function Test では、単一 public API の actor、店舗境界、return DTO、上限、token 状態、rate limit、冪等性、異常時の副作用ゼロを検証する。

HTTP ActionのFunction Testでは、method、content type、body上限、CORS、署名またはservice credential、replay、event dedupe、外部応答を`t.fetch()`で検証する。

Scenario Test では、再発行後の旧 capability 失効、workflow の中断と再開、stale lease 回収、削除と worker の競合、fanout 完了、retention job の再実行可能性を検証する。

provider の実到着は通常の Function Test と Scenario Test へ含めず、隔離した canary へ分ける。

## 設計レビューの成果物

Convex の横断設計をレビューするときは、次の順でまとめる。

1. 結論
2. 現在の構造と維持する設計
3. 確認できた事実と推測を分けた、優先度付きfindings
4. 最終状態の設計契約
5. migrationと互換性の制約
6. Function TestとScenario Testの追加契約
7. 運用指標と障害復旧手順
8. 未決定事項と実測が必要な事項
9. 過剰設計として採用しない案
