# 公開サブページ

製品理解、疑問の解消、操作支援、登録前の体験を目的とする公開ページ群である。
現在のコンテンツとメタデータは、各featureのコードとMDXを正本とする。

## 画面

| パス | 内容 |
|---|---|
| `/features` | 希望回収、未提出確認、シフト作成、確定通知の紹介 |
| `/faq` | カテゴリ、検索、図、HowTo導線を備えた総合FAQ |
| `/howto` | 利用中の店舗運営者とスタッフ向けの操作手順とトラブル対応 |
| `/articles` | シフト作成ガイドの記事一覧 |
| `/articles/:slug` | 記事詳細 |
| `/articles/categories/:categorySlug` | カテゴリ別の記事一覧 |
| `/demo/flow` | 募集作成から確定通知までのフローデモ |
| `/demo/shiftboard` | 登録なしで試せるシフト表デモ |

## コンテンツの責務

| 場所 | 役割 |
|---|---|
| TOP | 最初に確認したいFAQを短く示し、総合FAQへ案内する |
| 総合FAQ | よくある疑問へ、その場で結論と注意点を回答する |
| HowTo | 画面上の場所、操作、結果、失敗時の対処を説明する |
| 記事 | 検索者の課題を整理し、判断材料と製品への導線を示す |
| デモ | 登録前に主要な操作と結果を試せるようにする |

FAQの質問と回答は `src/components/features/FaqSite/`、HowToは `src/components/features/HowToSite/content/`、記事は `src/components/features/ArticleSite/content/` が所有する。
HowToの追加と更新には `write-help-content`、デモの設計には `demo-ux` を使う。
記事では、ユーザーが明示した場合だけ `$seo-article-writer` を使う。
共通のUI原則は `doc/rules/ui-design.md` を参照する。

## 関連ファイル

- `src/routes/features.tsx`、`src/pages/features/`：できること
- `src/routes/faq.tsx`、`src/pages/faq/`：総合FAQ
- `src/routes/howto.tsx`、`src/pages/howto/`：使い方とヘルプ
- `src/routes/articles*.tsx`、`src/pages/articles/`：記事一覧、記事詳細、カテゴリ
- `src/routes/demo.*.tsx`、`src/pages/demo-*/`：公開デモ
- `src/components/features/FaqSite/`：FAQコンテンツと表示
- `src/components/features/HowToSite/`：HowToコンテンツと表示
- `src/components/features/ArticleSite/`：記事コンテンツと表示
- `src/components/features/Demo/`：公開デモ
- `src/components/templates/PublicPageLayout/`：公開ページ共通レイアウト
- `src/pages/*/meta.ts`、`src/lib/seo/`：ページ別メタデータと共通SEO処理
- `scripts/prerender.ts`、`public/sitemap.xml`：静的HTMLと公開URL
- `scripts/generateArticleOgp.ts`、`public/ogp/articles/`：記事別OGP画像

## メタデータ

全ページの既定値は `index.html`、route別の値は対応する `src/pages/*/meta.ts` が所有する。
FAQ、BlogPosting、BreadcrumbListなどの構造化データは、画面へ表示する現在内容と一致させる。
prerender時の重複排除と出力規則は `scripts/prerender.ts` を正本とする。

## API

FAQ、HowTo、記事、デモの公開コンテンツを表示するためのConvex APIはない。
問い合わせなど、別機能が所有するAPIは対応する機能文書を参照する。
