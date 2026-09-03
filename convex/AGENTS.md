# convex/AGENTS.md

このファイルは `convex/` 配下へ適用する。
ルートの `AGENTS.md` と併せて読む。

## 必読

Convexコードを扱う前に、次を読む。

1. `convex/_generated/ai/guidelines.md`
2. `convex/AGENTS.md`
3. 設計境界を変更する場合は `doc/rules/convex-design-strategy.md`
4. セキュリティ境界を変更する場合は `doc/rules/security-strategy.md`
5. テスト層、配置、新しい検証契約を判断する場合は `doc/rules/testing-strategy.md`

局所変更では近い既存実装を優先する。
複数ユースケース、public API、Capability、永続ワークフロー、データ寿命、運用契約を横断する場合は `convex-design-review` を使う。

## 配置

Convexコードはユースケース単位とCQRSを基本とする。

| 対象 | 配置 |
|---|---|
| 特定機能のquery、mutation、action | `convex/{useCase}/` |
| mutation引数をフロントエンドと共有するZod schema | `convex/{useCase}/schemas.ts` |
| 複数ユースケースで使う実装 | `convex/_lib/` |
| 環境変数由来の設定 | `convex/_lib/config.ts` |
| TTL、limit、時刻単位などの共通定数 | `convex/constants.ts` |
| schema | `convex/schema.ts` |

- DB tableではなく、呼び出すactorとユースケースで配置を決める。
- 外部API呼び出しは原則 `internalAction` とし、所有するユースケースの `actions.ts` に置く。
- 通知の配送、文面、fanoutは `notification/` に置く。
- staff tokenとsessionの境界は `staffAuth/`、確定シフトの閲覧は `shiftView/` に置く。
- LINE OAuth、Webhook、LINE API境界は `line/` に置き、通知配送と混ぜない。
- 既存のwrapper、policy、serviceを確認してから新しい抽象化を作る。

## 常時制約

- `_` で始まるディレクトリは公開APIとして使わない内部実装に限定する。
- public query、mutation、action、HTTP routeは外部から直接呼ばれる前提で扱う。
- manager、authenticated、staff session向けpublic functionでは、`convex/_lib/functions.ts` の既存認証wrapperを使う。
- raw public functionは、匿名Capabilityやprovider callbackなど、設計上必要なallowlistだけに限定する。
- 店舗スコープの入力IDは取得後に所属を検証し、存在と権限不足を区別して漏らさない。
- public functionにはruntimeの `args` と `returns` validatorを定義する。
- queryの返り値は必要なfieldだけで構成し、DB documentをそのまま返さない。
- 一覧取得はindexと上限を使い、無制限の `.collect()` を避ける。
- 論理削除済みdocumentは、対象ユースケースの有効データから除外する。
- 外部副作用はmutationからinternal actionへ渡し、再実行時の重複を防ぐ。
- schedulerの一回実行だけに、回復が必要なworkflowの完了を依存させない。
- secret、token、個人情報、provider payloadをログへ出さない。
- デバッグ専用のConvex環境変数名は`DEBUG_`で始める。
- `convex-billing`は、新規の単純なStripe課金を検討するための参考資料であり、このリポジトリの課金設計・実装の正本ではない。既存課金では`organizationBilling`、`organizationStripe`と関連するFeature・業務仕様・運用文書を優先し、`@convex-dev/stripe`の導入や置換は、明示的な再設計とmigration判断なしに行わない。

## 日付と時刻

- `YYYY-MM-DD` は店舗業務上のJST暦日として扱う。
- `*At` はUnix millisecondsの瞬間値として扱う。
- 業務日付の生成と変換には `convex/_lib/dateFormat.ts` のhelperを使う。
- `toISOString()`の切り出しや、日付だけの文字列を `new Date()` へ渡す方法で業務日付を作らない。
- cronや締切では、JSTの仕様とUTCで保存・実行する値の対応を明示する。

## セキュリティ変更

次を新設・変更する相談、計画、設計、実装、レビューでは、プラン確定前に `shiftori-security-review` を使う。

- 認証、認可、tenant境界、IDOR
- public function、HTTP route、Webhook、service credential
- magic link、staff session、招待、Capability lifecycle
- LINE、Resend、billingなどの外部連携
- 通知配送、Outbox、外部副作用、replay、rate limit
- 個人情報、retention、redaction、削除状態

内部の並び順、命名、配置だけを変え、既存の安全契約を変えない場合は自動発動しない。

## schemaとmigration

- 保存済みデータの形を変える、既存documentが新schemaに合わなくなる、またはbackfillが必要な場合は `convex-migration-helper` を使う。
- 本番データが存在する変更はWiden → Migrate → Narrowで進め、一度に破壊的変更を行わない。
- migrationは1ファイルに一つとし、`convex/migrations/m{3桁連番}_{snake_case}.ts`へ置く。
- 連番は`001`からの追加専用とし、欠番、再採番、既存番号の再利用をしない。
- 全体runnerへ追加する場合は、既存配列の末尾へ連番順で追加する。
- Widenで後から外すschema互換とfallbackには、対象migrationと完了条件を示す`TODO[narrow]:`を残す。
- schema変更だけで完了とせず、backfill、読み取り互換、完了確認、Narrowの追跡を計画する。

## テスト

- テスト層と配置は `doc/rules/testing-strategy.md` を正本とする。
- テスト層、配置、新しい検証契約を判断する場合は `test-strategy` を使う。
- 同じ層の近いテストを追従更新するだけなら、その既存パターンを優先する。
