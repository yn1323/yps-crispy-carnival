# Convex backend

シフトリのConvex backendは、Use-Case Slices + CQRSで構成する。

以下は新規実装と見直し時の標準であり、既存フローがすべて適合済みであることを示さない。

作業前に次を読む。

1. `convex/_generated/ai/guidelines.md`
2. `doc/rules/convex-design-strategy.md`
3. `convex/AGENTS.md`
4. `doc/rules/testing-strategy.md`
5. セキュリティに触れる場合は `doc/rules/security-strategy.md`

## 構成

```text
convex/
  {useCase}/
    schemas.ts
    queries.ts
    mutations.ts
    actions.ts
  _lib/
  _scenario/
  _test/
  migrations/
  schema.ts
  crons.ts
  http.ts
```

- APIはDBテーブルではなく、利用者とユースケースで分ける。
- public functionとHTTP routeは認証済み利用者、スタッフSession、公開Capability、anonymous HTTP、providerまたはservice HTTPのいずれかへ分類する。
- 店舗スコープのmanager APIは、選択中`shopId`とactive membershipを検証する。
- 一覧と集計はboundedにし、上限超過で不正確になる場合はtruncationを明示する。
- 外部副作用とfanoutは永続job、lease、retry、idempotencyを持つinternal workerへ渡す。
- persisted shapeの変更はWiden、Migrate、Narrowで進める。
- 単一API境界はFunction Test、複数API後の状態遷移はScenario Testで検証する。

## コマンド

```bash
pnpm test:convex
pnpm type-check
pnpm lint
pnpm convex:migrate:status
```

Convex、Vite、Storybookの開発サーバーはユーザーが起動するため、Codexから新規起動しない。
