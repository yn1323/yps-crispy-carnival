# 公開サブページ

LPの既存コンテンツを流用し、検索結果に法務ページ以外の自然な導線を出すための公開ページ群。
新規説明文は最小限にし、詳細な訴求はLPセクションをSingle Source of Truthとして扱う。

## 関連ファイル

- `src/routes/features.tsx` / `src/pages/features/index.tsx` — できることページ
- `src/routes/faq.tsx` / `src/pages/faq/index.tsx` — よくある質問ページ
- `src/routes/articles.tsx` / `src/routes/articles.$slug.tsx` / `src/routes/articles.categories.$categorySlug.tsx` — 記事一覧・記事詳細・カテゴリページ
- `src/routes/_unregistered/demo.flow.tsx` / `src/pages/demo-flow/index.tsx` — 募集から確定通知までのフローデモ
- `src/routes/_unregistered/demo.shiftboard.tsx` / `src/pages/demo-shift-board/index.tsx` — 店長・シフト担当者向けシフト表デモ
- `src/components/features/Demo/` — 公開デモ用コンポーネント
- `src/components/features/LandingPage/` — 流用元のLPセクションと公開導線
- `src/components/features/ArticleSite/` — Markdown管理の記事サイトとLP記事ミニ導線のソース
- `scripts/prerender.ts` / `public/sitemap.xml` — 静的HTML生成と検索エンジン向けURL一覧。記事詳細・カテゴリ詳細はMarkdownディレクトリから自動収集する

## 画面一覧

| パス | 内容 |
|---|---|
| `/features` | 希望回収、未提出確認、シフト作成、確定通知の紹介 |
| `/faq` | 導入前によくある質問 |
| `/articles` | 小さなお店向けのシフト作成ガイド記事一覧 |
| `/articles/:slug` | 記事詳細 |
| `/articles/categories/:categorySlug` | 困りごとカテゴリ別の記事一覧 |
| `/demo/flow` | 募集作成、希望提出、調整、確定通知まで試せるフローデモ |
| `/demo/shiftboard` | 登録なしで試せる店長・シフト担当者向けデモ |

## API一覧

なし。公開サブページはLPコンテンツの静的表示のみで、Convex APIは利用しない。
