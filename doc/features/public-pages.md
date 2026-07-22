# 公開サブページ

公開用コンテンツを役割別に再利用し、検索結果に法務ページ以外の自然な導線を出すためのページ群。
FAQの質問・回答は`FaqSite`をSingle Source of Truthとし、詳しい操作手順は`HowToSite`のMDXで管理する。

## 関連ファイル

- `src/routes/features.tsx` / `src/pages/features/index.tsx` — できることページ
- `src/routes/faq.tsx` / `src/pages/faq/index.tsx` / `src/pages/faq/meta.ts` — 総合FAQページとメタデータ
- `src/routes/articles.tsx` / `src/routes/articles.index.tsx` / `src/routes/articles.$slug.tsx` / `src/routes/articles.categories.$categorySlug.tsx` — 記事レイアウト・記事一覧・記事詳細・カテゴリページ
- `src/routes/demo.flow.tsx` / `src/pages/demo-flow/index.tsx` — 募集から確定通知までのフローデモ（`_unregistered` 外に置き、Clerk/Convexバンドルを載せない）
- `src/routes/demo.shiftboard.tsx` / `src/pages/demo-shift-board/index.tsx` — 店長・シフト担当者向けシフト表デモ（同上）
- `src/components/features/Demo/` — 公開デモ用コンポーネント
- `src/components/features/LandingPage/FaqArticlesSection/index.tsx` — TOPの注目FAQ 7問と総合FAQへの導線
- `src/components/features/FaqSite/landingFaqContent.ts` — TOPの注目FAQ 7問と表示内容に対応する構造化データ
- `src/components/features/FaqSite/faqContent.ts` — 注目FAQを含む全質問、カテゴリ、検索語、HowTo導線、総合FAQの構造化データ
- `src/components/features/FaqSite/index.tsx` / `FaqVisual.tsx` — 総合FAQの検索・表示、補助図、表示内容に対応する構造化データの出力
- `src/components/templates/PublicPageLayout/` / `PublicFooter/` — Header・main・Footerを揃える公開ページ共通レイアウト
- `src/components/features/FeatureSection/` / `BenefitsSection/` — `/features`が所有する公開section
- `src/components/features/ArticleSite/` — MDX管理の記事サイトとLP記事ミニ導線のソース
- `src/components/features/HowToSite/` — MDX管理の使い方・ヘルプとページ内検索のソース
- `scripts/prerender.ts` / `public/sitemap.xml` — 静的HTML生成と検索エンジン向けURL一覧。記事詳細・カテゴリ詳細はMDXディレクトリから自動収集する
- `scripts/generateArticleOgp.ts` / `public/ogp/articles/` — 記事別OGP画像の生成スクリプトと生成物（`pnpm ogp:articles`。記事の追加・タイトル変更時に再生成してコミットする）
- `src/pages/*/meta.ts` — routeごとのメタデータ組み立て
- `src/lib/seo/index.ts` — メタタグ・JSON-LDヘルパー（`ogType` / `ogImage` で記事別OGPを上書き）

## OGP・構造化データ

- `index.html` — 全ページ共通の既定値（og:type=website、共通OGP画像、SoftwareApplication / Organization / WebSite）
- `/` — `FAQPage`（`FaqSite`で注目対象にした7問のみ）
- `/faq` — `FAQPage`（総合FAQに掲載する全質問）
- `/articles/:slug` — og:type=article、記事別OGP画像、`BlogPosting` + `BreadcrumbList`
- `/articles/categories/:categorySlug` — `BreadcrumbList`
- ルート側で og:type / og:image を出すと、prerender が index.html の既定タグと重複排除して後勝ちで焼き込む（`scripts/prerender.ts` の `ROUTE_MANAGED_META_*`）

## 画面一覧

| パス | 内容 |
|---|---|
| `/features` | 希望回収、未提出確認、シフト作成、確定通知の紹介 |
| `/faq` | カテゴリ、ページ内検索、図、HowTo導線を備えた総合FAQ |
| `/howto` | 利用中の管理者・スタッフ向けの詳しい操作手順とトラブル対応 |
| `/articles` | シフト作成ガイド記事一覧 |
| `/articles/:slug` | 記事詳細 |
| `/articles/categories/:categorySlug` | 困りごとカテゴリ別の記事一覧 |
| `/demo/flow` | 募集作成、希望提出、調整、確定通知まで試せるフローデモ |
| `/demo/shiftboard` | 登録なしで試せる店長・シフト担当者向けデモ |

## FAQとHowToの責務

| 場所 | 役割 |
|---|---|
| TOP（`/`） | 最初に確認したい注目FAQ 7問を短く示し、必要に応じて`/faq`へ案内する |
| 総合FAQ（`/faq`） | よくある疑問をカテゴリと検索で探せるようにし、その場で結論と注意点まで回答する |
| 使い方・ヘルプ（`/howto`） | 画面上の場所、操作手順、失敗時の対処を一つの目的ごとに詳しく説明する |

総合FAQでは、通知先の決まり方、グループと店舗の関係、下書き保存後の再提出など、文章だけでは関係を捉えにくい回答に図を添える。
実際の操作が必要な回答からは、該当するHowToへ直接移動できるようにする。

## API一覧

なし。FAQのカテゴリ、検索、図、HowTo導線は静的コンテンツで構成し、Convex APIは追加しない。
