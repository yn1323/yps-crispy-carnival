# Convex設計方針

## 目的

この文書は、シフトリのConvex backendで維持する責務、境界、状態設計の原則を定める。
個別機能の現在仕様はコードと `doc/features/`、実装時の常設制約は `convex/AGENTS.md`、横断レビューの手順は `convex-design-review` が所有する。

認証、認可、abuse対策、機密情報は `security-strategy.md`、テスト層は `testing-strategy.md`、schema移行の手順は `convex-migration-helper` を参照する。

## ユースケース単位とCQRS

APIはDB tableではなく、利用者とユースケースで分ける。
query、mutation、actionを役割で分け、外部API呼出しをmutationへ混ぜない。

queryとmutationは `ctx.db` を直接使ってよい。
全処理へrepository interfaceを挟まず、複数ユースケースで意味が同じpolicy、validator、純粋処理だけを共通化する。

ファイルの大きさだけで全面再編しない。
状態遷移、呼出し主体、変更理由が異なる責務を局所的に分ける。

## 呼出し主体と境界

public functionまたはHTTP routeを作る前に、呼出し主体を分類する。

| 境界 | 主な用途 |
|---|---|
| authenticated | 店舗が確定する前も必要なsetupと所属取得 |
| manager | 店舗単位の管理操作 |
| staff session | スタッフの提出と閲覧 |
| public capability | magic link、登録、同意、連携 |
| anonymous HTTP | identityを持たない公開受付 |
| provider / service HTTP | Webhook、service間連携、内部BI |
| internal | cron、fanout、集計、migration、worker |

複数の境界に該当する場合は、それぞれの契約を重ねる。
認証方式とサーバー側の検証は `security-strategy.md` を正本とする。

新しい店舗スコープのmanager APIは、対象の `shopId` を明示的に受け取る。
最初の所属店舗へのfallbackは、setupや店舗選択の初期化に加え、追跡中の移行互換として残る既存APIだけに限定する。
移行互換のfallbackには終了条件を持たせ、呼出し元の移行後に削除する。

## Public API

public query、mutation、action、HTTP Actionは外部契約として扱う。
各APIは、次を設計時に明確にする。

- 呼出し主体と対象店舗。
- user-controlledなIDと所属検証。
- runtime `args` validatorと`returns` validator。
- 最小DTOまたは最小response。
- 入力件数、返却量、走査量の上限。
- rate limit、冪等性、dedupeの要否。
- DB、scheduler、外部APIへの副作用。
- 主担当となるFunction TestまたはScenario Test。

HTTP Actionでは、method、path、content type、body上限、CORS、署名またはcredential、replayとevent重複も契約に含める。

利用箇所がないpublic functionとHTTP routeは、形状をテストで固定する前に削除またはinternal化を検討する。
匿名またはcapability境界を意図しないpublic functionは、既存の認証wrapperを使う。

## Capabilityのライフサイクル

magic link、session、登録URL、招待、法務同意、連携tokenは、用途ごとにライフサイクルを定義する。

| 項目 | 定義する内容 |
|---|---|
| scope | shop、subject、recruitment、access kind、purpose |
| 保管 | raw tokenまたはdigest |
| 有効期間 | `createdAt`、`expiresAt`、業務上の失効条件 |
| 使用回数 | single-useまたはreusable |
| 再発行 | newest-onlyまたは複数有効 |
| 無効化 | `usedAt`、`revokedAt`、version、rotation |
| abuse対策 | token、IP、店舗、globalのrate limitと試行上限 |
| 後処理 | 期限切れ、使用済み、失効済みrecordの保持とprune |

newest-onlyのcapabilityは、発行と同じtransactionで同じscopeの古い未使用tokenをrevokeする。
検証と消費が別処理になる場合は、消費時にもversionと状態を確認する。

期限切れ、使用済み、失効済みのrecordは、indexを使ったbounded batchで処理する。
credentialとしての扱いと外部応答は `security-strategy.md` を正本とする。

## Durable Workflow

外部副作用または多数の対象へfanoutする処理は、mutationが処理意図を永続化してから開始する。
scheduled actionは実行手段であり、処理全体の進捗を保持するworkflowとして扱わない。

中断後の再開が必要な処理は、永続jobへ次の状態を持たせる。

- status、cursor、attempt count。
- 次回実行時刻と処理開始時刻。
- leaseまたはprocessing deadline。
- operation epochまたはversion。
- 安全なerror code。
- 作成時刻と更新時刻。

代表的な状態遷移は次の形になる。

```text
pending -> processing -> completed
                     -> pending
                     -> failed
                     -> cancelled
```

claimは実行可能なrecordだけを排他的に取得する。
`processing` を再取得できるのはleaseが失効した場合に限り、staleな処理はreaperが回収する。

完了、retry、failureは、期待するstatus、lease、epochが一致するときだけ更新する。
古いworkerが新しい状態またはterminal stateを上書きさせない。

外部副作用は複数回実行される可能性がある。
providerが対応する場合は、安定したoperation IDに基づくidempotency keyを渡す。

fanoutはbounded batchで進め、cursorと完了状態を永続化する。
actionが完了記録を残す前に停止しても、未完了jobと最終成功時刻から検知できる状態にする。

削除または通知停止の開始後は新規enqueueを拒否し、必要なjobを `cancelled` へ遷移させる。
claim後の競合に備え、外部API呼出しの直前に対象状態とoperation epochを確認する。

## Schemaの不変条件

schemaは保存形式だけでなく、業務上あり得る組合せを表す。

- actorやsubjectの種類でfieldが変わる場合はdiscriminated unionを使う。
- both-or-neitherを許さないoptional IDの組合せを作らない。
- singletonまたは一意性は、indexと同じtransaction内のwrite policyで守る。
- `v.optional()` は、業務上任意、移行中、未計算のどれかを区別する。
- 移行中のoptionalとfallbackは、対象migrationと狭める条件を追跡できるようにする。
- 集計またはsnapshotの定義が変わる場合は、算出versionで混在を検出できるようにする。

保存済みデータの形式を変更するときは、互換期間とmigrationを実装変更から分けて設計する。
widen-migrate-narrowの手順は `convex-migration-helper` が所有する。

## Bounded Readと集計

一覧と集計は、現在件数ではなく増加後の上限を基準に設計する。
indexでtenantと主要条件を絞り、入力件数、走査量、返却量を別の上限として扱う。

native paginationでは、validatorが保証するpagination optionsを失わない形で `.paginate()` へ渡す。
初期page sizeを最大返却件数と誤認しない。

固定件数のsnapshot APIとcursor paginationを同じ返却契約に見せない。
上限超過で正確性が失われる値を、正確な集計として保存または表示しない。

全件集計が契約なら、write時に維持するcounterまたはcursorと中間結果を永続化するjobを使う。
小さな上限が保証されない限り、単一function内で全pageを読み切らない。

capped valueが契約なら、切り詰めの有無、下限、対象上限などを値とともに持たせる。
digest table、document分割、counter、shardingは、unboundedな処理、既知のhot path、実測のいずれかを根拠に導入する。

## データ寿命と監査

論理削除はアクセス停止であり、個人情報の消去完了ではない。
永続tableごとに、目的、owner、tenant key、active期間、保持期間、論理削除、redact、物理削除、backup上の扱いを定義する。

通知payloadと監査metadataを分ける。
宛先、本文、raw capability URL、providerのraw errorは、再送と調査に必要な期間を過ぎたらredactまたは削除する。

責任追跡が必要な操作は、actor、shop、action、target、時刻、correlation ID、安全なmetadataを持つ追記型audit eventを検討する。
document全体や不要な個人情報を監査記録へ保存しない。

大量のredactまたは削除は、cursorと進捗を持つ再開可能なjobで行う。

## Test Helperの隔離

全件削除やseedなどの破壊的internal functionは、internalであることだけを本番防御にしない。
E2E専用deploymentと明示的なenable条件を必要とし、productionでは起動できない状態にする。

読み取りprobeと破壊的commandを同じ権限へまとめない。
可能な場合は、破壊的helperをproduction artifactから分ける。

## 運用可能性

非同期処理は、未完了と停滞をログ以外から確認できる状態を持つ。
少なくともbacklog、最古のpending、lease超過、retry回数、最終成功時刻を安全な集計値または状態tableから確認できるようにする。

token、session、Webhook、rate limit、migration、集計についても、期限切れ未処理、失敗、重複、version混在を検知できる状態を設計する。
閾値と人間の確認手順は、対象機能の運用文書が所有する。

## テストの分担

Function Testは、単一public APIのactor、店舗境界、validator、最小DTO、上限、直接副作用を守る。
Scenario Testは、capability再発行、workflow中断、stale lease、削除との競合、fanout、retentionの状態遷移を守る。

providerへの実到着と本番容量は、通常のFunction TestとScenario Testへ含めない。
必要な場合は、対象、環境、判定、復旧を定めた運用確認または容量検証として分ける。
