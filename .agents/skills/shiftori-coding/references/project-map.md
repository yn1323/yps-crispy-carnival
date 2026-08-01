# Project Map

## 調査元

このスキルは以下を元に作る。

- `AGENTS.md`
- `src/AGENTS.md`
- `doc/rules/frontend-architecture.md`
- `doc/rules/convex-design-strategy.md`
- `convex/AGENTS.md`
- `convex/_generated/ai/guidelines.md`
- `e2e/AGENTS.md`
- `.github/AGENTS.md`
- `src/components/features/ArticleSite/AGENTS.md`
- `doc/rules/testing-strategy.md`
- `doc/ARCHITECTURE.md`
- `doc/INDEX.md`
- `package.json`
- `vitest.config.ts`
- `biome.json`
- `tsconfig.json`
- `vite.config.ts`
- 実例: `src/routes/_auth/dashboard.tsx`, `src/pages/dashboard/index.tsx`, `src/components/features/CreateRecruitmentForm/*`, `src/hooks/useSingleFlight.ts`, `src/hooks/useShopMutation.ts`, `src/domains/shift/date.ts`, `convex/_lib/functions.ts`, `convex/dashboard/queries.ts`, `convex/recruitment/*`

## 技術スタック

- React 19 + Vite 7
- TanStack Router
- Chakra UI v3
- React Hook Form + Zod 4
- Jotai
- Clerk
- Convex + convex-helpers + @convex-dev/migrations
- Biome
- Vitest, Storybook browser tests, Playwright E2E, Storycap + RegSuit VRT

## 主要ディレクトリ

```text
src/
  routes/       URL定義、head、search/params の受け渡し
  pages/        route全体のquery、metadata、loading/error/null/normal の分岐
  components/
    features/   機能UI、feature-local query、useMutation/useAction、ユーザー操作
    shared/     複数featureで使う業務UI
    templates/  Header、StaffLayout、公開ページshellなどレイアウト
    ui/         Chakra UI v3 ラッパー、汎用UI
  domains/      React / Convex / Chakra / Jotai に依存しない型、定数、純粋関数
  providers/    React Provider、外部SDK初期化
  stores/       Jotai atom
  hooks/        横断 React hook
  lib/          SEO、MDX、GTM、browserなど技術的な共通処理
  configs/      theme、zod、environment、test setup
  constants/    アプリ横断定数
  assets/       複数featureで共有するimport asset
  devtools/     本番から参照しない開発用UI

convex/
  _lib/         共通 helper、認証 wrapper、日付、通知、rate limit
  _test/        convex-test helper、fixture、scenario operation wrapper
  _scenario/    複数 API を通す業務フローテスト
  migrations/   @convex-dev/migrations の個別 migration
  {useCase}/    schemas.ts / queries.ts / mutations.ts / actions.ts

e2e/
  pages/        Page Object
  scenarios/    ユーザーストーリー単位の Playwright test
  fixtures/     認証 setup
  helpers/      Convex seed / date / token helper
```

## 既存スキルとの分担

- `shiftori-coding`: 実装全体の入口、配置、一般パターン、自己更新。
- `ui-architect`: UI/UX、文言、Chakra UI、状態設計。
- `test-strategy`: テスト層、Storybook play、VRT、Scenario Test、E2E。
- `convex-migration-helper`: schema/data migration、Widen → Migrate → Narrow。
- `convex-performance-audit`: Convex read amplification、subscription、OCC、function limit。
- `convex-design-review`: Convexの認証境界、公開API、Capability、durable workflow、データ寿命、運用契約。
- `seo-article-writer`: ArticleSite の記事・SEOコンテンツ。

## 変更時のドキュメント

新機能を実装したら `doc/features/` に機能概要を作成または更新し、`doc/INDEX.md` にリンクを追加する。
詳細仕様はコードを Source of Truth にして、ドキュメントへ二重管理しない。
