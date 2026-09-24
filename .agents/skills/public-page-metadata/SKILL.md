---
name: public-page-metadata
description: シフトリの公開ページのtitle、description、canonical、OGP、JSON-LD構造化データを追加・変更するとき、同期漏れと検証漏れを防ぐ。サイト名・別名・説明・ロゴ・公式プロフィール、`buildMeta`、FAQPage・BlogPosting・BreadcrumbListを触るときに使う。記事やヘルプの本文執筆だけの作業には使わない。
---

# 公開ページのメタデータを変更する

公開ページのtitleと構造化データは、複数のファイルが同じ値を持つ。
一箇所だけを直して、検索結果と構造化データの内容が食い違う状態を防ぐ。

## 正本を確認する

1. `doc/features/public-pages.md`の「静的生成とメタデータ」を読む。
2. `src/lib/seo/`と、変更するpageの`meta.ts`を読む。
3. 記事は`src/components/features/ArticleSite/AGENTS.md`、ヘルプは`src/components/features/HelpCenter/AGENTS.md`も読む。

sitemapの更新規則は`doc/features/public-pages.md`と`src/components/features/ArticleSite/AGENTS.md`を正本とし、このSkillでは扱わない。

## 変更の種類ごとに同期する

### サイト全体の情報

サービス名、英字の別名、説明、ロゴ、公式プロフィールの正本は、`src/lib/seo/siteJsonLd.ts`と`src/lib/seo/index.ts`の`SITE_NAME`・`SITE_URL`である。
これらを変えた場合は、同じ情報を持つ次の箇所も確認し、必要なら同じ変更に含める。

- `src/routes/__root.tsx`のfallback title、`og:site_name`、OGP画像
- `src/components/features/ArticleSite/articleMeta.ts`のBlogPostingの`publisher`
- `public/manifest.json`の`name`と`short_name`
- `public/llms.txt`の冒頭の説明

`sameAs`には、ユーザーが運営者として確認した公式プロフィールのURLだけを入れる。
推測したURLや、環境ごとに別アカウントを指す環境変数の値は入れない。
公式プロフィールを追加・削除した場合は、`src/lib/seo/index.test.ts`の期待値も更新する。

### titleとdescription

titleは`buildMeta`を通し、各pageでサイト名を手書きで付けない。
区切りには`｜`だけを使い、` | `を使わない。
サイトリンクに出る可能性がある主要ページは、最初の`｜`までで意味が通る語を先頭に置く。

### ページ別の構造化データ

FAQPage、BlogPosting、BreadcrumbList、ヘルプの構造化データは、画面に表示する内容と同じデータから生成する。
JSON-LDだけに存在する質問、回答、日付、画像を作らない。
表示内容を変えた場合は、同じデータを使うJSON-LDの出力とテストが追従しているかを確認する。

新しい種類の構造化データを追加する場合は、Google検索のガイドラインで対象のページ種別に使えることを確認し、pageの`meta.ts`で組み立てる。

## 検証する

1. 変更したtitleとJSON-LDの主担当Logic Testを実行する。
   - サイト全体とtitle：`src/lib/seo/index.test.ts`
   - TOPのFAQ：`src/components/features/LandingPage/FaqArticlesSection/script.test.ts`
   - 記事：`src/components/features/ArticleSite/articleContent.test.ts`
   - ヘルプ：`src/components/features/HelpCenter/helpContent.test.ts`と`src/pages/help/*Meta.test.ts`
2. `pnpm build`を実行し、`scripts/validateStaticBuild.ts`のmetadata検証を通す。
   sandboxのlisten制限でprerenderが失敗した場合は、コードの失敗と区別する。
3. `dist/client/`の変更対象HTMLからtitleとJSON-LDを抽出し、JSONとしてparseでき、意図した値と`@id`の参照になっていることを確認する。
4. 所有者や書式を変えた場合は、`doc/features/public-pages.md`を更新する。

## 結果を報告する

- 変更したtitle、構造化データの種類と値
- 同期した箇所と、確認して変更不要だった箇所
- 実行した検証
- Googleの再取得やSearch Consoleでの確認など、デプロイ後に人が確認すること
