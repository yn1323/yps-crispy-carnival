---
name: seo-article-writer
description: シフトリの日本語SEO記事・ヘルプ記事を、手動呼び出し専用で作成・改稿するスキル。src/components/features/ArticleSite/content/articles 配下の記事Markdown、カテゴリ、関連記事、内部リンク、検索意図に沿った日本語SEOライティング、読みやすい改行、public/sample-touch.png のタッチに合わせた記事画像生成を扱う。ユーザーが $seo-article-writer を明示したときだけ使い、通常のSEO・記事・ブログ依頼では暗黙起動しない。
---

# SEO Article Writer

## 呼び出し条件

このスキルは、ユーザーが `$seo-article-writer` を明示したときだけ使う。
通常の「記事を書いて」「SEOを見て」だけでは使わない。

既存の別記事スキルには依存しない。
このスキル、現在のリポジトリ、必要に応じた最新のWeb調査だけを使う。

## 必ず読むもの

記事の新規作成・改稿の前に読む。

- `doc/rules/testing-strategy.md`
- `src/components/features/ArticleSite/AGENTS.md`
- `references/article-site.md`
- `references/seo-writing-guide.md`
- `references/image-generation.md`（画像を作る場合）

frontmatter、画像パース、Markdownレンダリングが不明なときは `src/components/features/ArticleSite/articleContent.ts` も読む。
Convexコードに触る場合は `convex/_generated/ai/guidelines.md` も読む。

## 作業手順

1. 依頼から記事の役割を決める。
   - 読者は小さなお店の店長、管理者、シフト作成担当者を基本にする。
   - 検索意図を「方法」「比較」「チェックリスト」「例文」「失敗対策」「製品導線」のどれかに寄せる。
   - 広すぎる依頼は、1本で役に立つ小さな困りごとに絞る。

2. 既存記事とカテゴリを確認する。
   - `src/components/features/ArticleSite/content/articles/` と `content/categories/` を見る。
   - 重複記事を増やさない。近い記事があれば改稿を優先する。
   - カテゴリは読者の悩み単位で選ぶ。機能名だけのカテゴリを増やさない。

3. 執筆前に短い記事ブリーフを作る。
   - 想定検索語
   - 読者の悩み
   - 読後にできること
   - H2構成
   - 内部リンク候補
   - CTAの置き方
   - 画像の有無、枚数、置き場所

4. 日本語SEO記事として書く。
   - 冒頭2段落で答えを出す。
   - 商品紹介より先に、手順、判断基準、例、チェックリストを置く。
   - 文体は落ち着いた `です/ます` にする。
   - 1文は短く、1段落は1つの話題にする。
   - スマホで読めるよう、長い段落を避けて自然に改行する。
   - 文字数を目的にしない。検索者の用事が済む量だけ書く。

5. ArticleSiteファイルを作成・更新する。
   - 記事：`src/components/features/ArticleSite/content/articles/{slug}/index.md`
   - カテゴリ：`src/components/features/ArticleSite/content/categories/{categorySlug}/index.md`
   - 画像：基本は記事ディレクトリに同梱する。
   - `canonicalPath` は `/articles/{slug}` にする。
   - 新規記事は `publishedAt` と `updatedAt` を今日の日付にする。
   - 既存記事の `updatedAt` は本文の意味が変わったときだけ更新する。

6. 画像を作る。
   - `public/sample-touch.png` を見て、タッチを合わせる。
   - 画像は理解を助けるときだけ入れる。
   - 短い記事は0〜1枚、標準記事は1〜2枚、長い比較・手順記事は最大4枚を目安にする。
   - 画像の近くの本文、alt、キャプションの意味をそろえる。

7. 検証する。
   - Markdownやschemaに関わる変更後は `pnpm vitest --project=logic src/components/features/ArticleSite/articleContent.test.ts` を実行する。
   - 完了前に `pnpm lint` と `pnpm type-check` を実行する。
   - Vite、Storybook、Convex dev serverは起動しない。ユーザーが起動済みなら、実際の記事ページをPCと390x844程度のSP幅で確認する。

## 品質基準

次を満たすまで完了にしない。

- 検索意図が1本に絞れている。
- タイトル、description、H2、本文、画像、CTAが同じ読者課題に向いている。
- 冒頭で答えを出している。
- 具体例、手順、チェックリスト、比較表、失敗対策のいずれかがある。
- 日本語が自然で、店舗運用の文脈に合っている。
- 改行が読みやすい。長い段落、詰まった箇条書き、1文だけの連打を避けている。
- キーワード詰め込み、根拠のない断定、使い回しの導入、AIっぽい空句がない。
- シフトリの機能・料金・実績・外部制度について未確認の断定がない。
- 画像が本文理解に役立ち、sample-touchの方向性から外れていない。
- ArticleSiteの対象テストが通っている。
