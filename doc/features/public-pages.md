# 公開サブページ

公開用コンテンツを共通利用し、検索結果に法務ページ以外の自然な導線を出すためのページ群。
新規説明文は最小限にし、詳細な訴求は各公開sectionをSingle Source of Truthとして扱う。

## 関連ファイル

- `src/routes/features.tsx` / `src/pages/features/index.tsx` — できることページ
- `src/routes/faq.tsx` / `src/pages/faq/index.tsx` — よくある質問ページ
- `src/routes/articles.tsx` / `src/routes/articles.index.tsx` / `src/routes/articles.$slug.tsx` / `src/routes/articles.categories.$categorySlug.tsx` — 記事レイアウト・記事一覧・記事詳細・カテゴリページ
- `src/routes/demo.flow.tsx` / `src/pages/demo-flow/index.tsx` — 募集から確定通知までのフローデモ（`_unregistered` 外に置き、Clerk/Convexバンドルを載せない）
- `src/routes/demo.shiftboard.tsx` / `src/pages/demo-shift-board/index.tsx` — 店長・シフト担当者向けシフト表デモ（同上）
- `src/components/features/Demo/` — 公開デモ用コンポーネント
- `src/components/features/LandingPage/` — TOPのLP本体とFAQデータ
- `src/components/features/LandingPage/faqs.ts` — LPとpage metadataから参照する純粋なsecondary public entry
- `src/components/templates/PublicPageLayout/` / `PublicFooter/` — Header・main・Footerを揃える公開ページ共通レイアウト
- `src/components/features/FeatureSection/` / `BenefitsSection/` / `FaqSection/` — `/features`・`/faq`が所有する公開section
- `src/components/features/ArticleSite/` — MDX管理の記事サイトとLP記事ミニ導線のソース
- `src/components/features/HowToSite/` — MDX管理の使い方・ヘルプとページ内検索のソース
- `scripts/prerender.ts` / `public/sitemap.xml` — 静的HTML生成と検索エンジン向けURL一覧。記事詳細・カテゴリ詳細はMDXディレクトリから自動収集する
- `scripts/generateArticleOgp.ts` / `public/ogp/articles/` — 記事別OGP画像の生成スクリプトと生成物（`pnpm ogp:articles`。記事の追加・タイトル変更時に再生成してコミットする）
- `src/pages/*/meta.ts` — routeごとのメタデータ組み立て
- `src/lib/seo/index.ts` — メタタグ・JSON-LDヘルパー（`ogType` / `ogImage` で記事別OGPを上書き）

## OGP・構造化データ

- `index.html` — 全ページ共通の既定値（og:type=website、共通OGP画像、SoftwareApplication / Organization / WebSite）
- `/`・`/faq` — `FAQPage`（`landingFaqs` を共有）
- `/articles/:slug` — og:type=article、記事別OGP画像、`BlogPosting` + `BreadcrumbList`
- `/articles/categories/:categorySlug` — `BreadcrumbList`
- ルート側で og:type / og:image を出すと、prerender が index.html の既定タグと重複排除して後勝ちで焼き込む（`scripts/prerender.ts` の `ROUTE_MANAGED_META_*`）

## 画面一覧

| パス | 内容 |
|---|---|
| `/features` | 希望回収、未提出確認、シフト作成、確定通知の紹介 |
| `/faq` | 導入前によくある質問 |
| `/howto` | 利用中の管理者・スタッフ向けの使い方とトラブル対応 |
| `/articles` | シフト作成ガイド記事一覧 |
| `/articles/:slug` | 記事詳細 |
| `/articles/categories/:categorySlug` | 困りごとカテゴリ別の記事一覧 |
| `/demo/flow` | 募集作成、希望提出、調整、確定通知まで試せるフローデモ |
| `/demo/shiftboard` | 登録なしで試せる店長・シフト担当者向けデモ |

## API一覧

なし。公開サブページはLPコンテンツの静的表示のみで、Convex APIは利用しない。
