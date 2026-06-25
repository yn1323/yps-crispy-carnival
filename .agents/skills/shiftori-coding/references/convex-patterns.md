# Convex Patterns

## 最初に読む

Convex コードを触る時は必ず以下を読む。

1. `convex/_generated/ai/guidelines.md`
2. `convex/AGENTS.md`
3. 近い useCase の `queries.ts` / `mutations.ts` / `schemas.ts` / tests

## 配置

Use-Case Slices + CQRS を守る。

```text
convex/{useCase}/
  schemas.ts    Zod schema。フロント共有。DB/API import 禁止
  queries.ts    読み取り
  mutations.ts  書き込み
  actions.ts    外部API、Node runtime、配送処理
```

共通処理は `convex/_lib/`、TTL/limit/時刻単位などは `convex/constants.ts` に置く。
DBテーブル名ではなく「誰がどの画面/機能で使う API か」で useCase を決める。

## 公開 API と認可

- Convex の public query/mutation/action はインターネットから叩ける前提で設計する。
- 原則として `convex/_lib/functions.ts` の `authenticatedQuery`、`authenticatedMutation`、`managerQuery`、`managerMutation`、`staffSessionQuery`、`staffSessionMutation` を使う。
- 生の `_generated/server` の `query` / `mutation` を新しい public API に直接使わない。
- query は未認証/未準備状態で `null`、空配列、空ページを返す設計が多い。mutation は `ConvexError` を throw する。
- クライアントから渡された ID は信頼しない。取得後に `shopId`、`isDeleted`、session/access kind を必ず確認する。
- `Not found` と `Forbidden` を分けて外部に漏らさない。
- query はドキュメントをそのまま返さず、必要な DTO だけ返す。

## Query

- index を使う。`filter` や無制限 `.collect()` に寄せない。
- 一覧は `take()`、`paginate()`、または上限定数で必ず bounded にする。
- `.collect().length` による件数取得は避ける。必要なら denormalized counter / stats table を検討する。
- 論理削除は `isDeleted` を常に除外する。
- Dashboard のような作業リストは、frontend-only resorting ではなく Convex の取得契約、index、上限、grouping semantics から見る。

## Mutation

- `args` には Convex validator を必ず定義する。
- mutation 共有 Zod schema を `schemas.ts` に置き、handler 内でも `safeParse` して business validation を行う。
- 重複作成、短時間連打、再送受付などは backend 側でも重複・状態遷移を守る。
- 外部副作用は DB 更新後に `ctx.scheduler` で internal action へ渡す。
- 削除は原則 `isDeleted` の論理削除。監査・通知・集計のため周辺データを残すか確認する。

## Action と通知

- 外部 API 呼び出しは `actions.ts` の `internalAction` に置く。
- Node built-in が必要な action ファイルだけ先頭に `"use node";` を付ける。query/mutation と同じファイルに混ぜない。
- action では `ctx.db` を使わない。必要なDB操作は query/mutation に寄せる。
- LINE メッセージ本文の URL は `convex/_lib/lineUrl.ts` の `withOpenExternalBrowser()` を通す。メールHTMLのURLには付けない。
- 通知の成功文言は実際に何が成功したかで分ける。enqueue / retry acceptance は配送成功ではない。

## 日付と時刻

- `YYYY-MM-DD` は店舗業務上の JST 暦日として扱う。UTC暦日に読み替えない。
- `createdAt` / `updatedAt` / `expiresAt` / `confirmedAt` / `deadlineAt` など `*At` は Unix ms の瞬間値。
- Convex 本番コードで業務日付を作る時は `convex/_lib/dateFormat.ts` の helper を使う。
- `new Date().toISOString().slice(0, 10)` や `new Date("2026-01-20")` で業務日付を作らない。
- cron はUTC指定になるため、コメントで `JST 17:00 = UTC 08:00` のように併記する。

## Schema と migration

- 既存データがあるため、required field 追加や型変更を一発で入れない。
- 破壊的変更は Widen → Migrate → Narrow に分ける。
- Widen では `v.optional()` や union で新旧両形式を受け入れる。
- migration は `convex/migrations/m{3桁}_{snake_case}.ts` に追加し、`convex/migrations/index.ts` の runner 配列末尾に登録する。
- Widen 中は `TODO[narrow]:` コメントを `convex/schema.ts` と fallback read 箇所に残す。
- Narrow 前に `grep -r "TODO\\[narrow\\]" convex/ src/` で残タスクを拾う。
- migration 作業なら `convex-migration-helper` を併用する。

## テスト

- 単一 query/mutation の契約は Convex Function Test。
- 複数 mutation/query 後の業務状態遷移は `convex/_scenario/` の Scenario Test。
- 共通 fixture は `convex/_test/`。Scenario Fixture は public/internal API を呼ぶ薄い operation wrapper にし、期待値や `expect(...)` を入れない。
