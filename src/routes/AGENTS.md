# routes 配下の実装ルール

フロントエンド全体の責務と依存方向は`doc/rules/frontend-architecture.md`をSource of Truthとします。

`src/routes/`はTanStack RouterのURL定義、head、params/searchの検証と受け渡しなど、ルート境界の責務だけを持ちます。
画面本体、状態分岐、機能UIは`src/pages/`と`src/components/features/`へ置きます。
`src/routeTree.gen.ts`は生成物のため手動編集しません。

- `__root.tsx`、route group、redirect-only routeを除くleaf routeは`src/pages/{page}/index.tsx`を呼びます。
- `head`用のtitle、description、JSON-LDは対応pageの`meta.ts`で組み立てます。
- `__root.tsx`とroute groupにはProvider、guard、layout、`Outlet`を置いてよいです。
- pathnameによる画面分岐は書かず、index routeまたはchild routeで表現します。
- query、mutation、action、loading/error/normalの業務分岐は書きません。

## `/howto`

- ルート定義は`src/routes/howto.tsx`、page入口は`src/pages/howto/`、画面本体は`src/components/features/HowToSite/`で管理します。
- 記事は個別ルートを作らず、`/howto#slug`で直接参照できる1ページ構成を保ちます。
- 操作記事では、`画面 → セクション → 対象行またはタブ → 操作名`が分かる本文にします。
- MDX本文は一文一行で書き、画面上で段落を分ける箇所には空行を入れます。
- 日本語の推敲では`.agents/skills/japanese-tech-writing/SKILL.md`に従います。
- 記事作成の詳しい判断基準は`src/components/features/HowToSite/AGENTS.md`に従います。
