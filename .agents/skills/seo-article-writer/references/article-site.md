# ArticleSite実装リファレンス

現在の実装と違う場合は、必ず `src/components/features/ArticleSite/AGENTS.md` と `articleContent.ts` を優先します。

## パス

- 記事一覧ページ：`src/components/features/ArticleSite/content/pages/articles.md`
- カテゴリ：`src/components/features/ArticleSite/content/categories/{categorySlug}/index.md`
- 記事：`src/components/features/ArticleSite/content/articles/{articleSlug}/index.md`
- Markdownローダー：`src/components/features/ArticleSite/articleContent.ts`
- 表示UI：`src/components/features/ArticleSite/index.tsx`

## 記事frontmatter

必須：

```md
---
title: "LINEでシフト希望を集める方法"
description: "記事カード・記事ヒーロー・関連記事に出る1〜2文の説明"
publishedAt: "2026-06-23"
updatedAt: "2026-06-23"
categorySlug: "shift-request"
categoryLabel: "LINEでシフト希望を集める"
author: "シフトリ編集部"
readingMinutes: 6
keywords: "LINE, 希望シフト, シフト回収"
relatedSlugs: "article-slug-a, article-slug-b"
featured: false
canonicalPath: "/articles/line-shift-collection-guide"
ogTitle: "OGタイトル"
ogDescription: "OG説明"
---
```

任意のヒーロー画像：

```md
heroImageSrc: "./hero.webp"
heroImageAlt: "シフト希望をフォームで提出する流れのイメージ"
heroImageWidth: 320
```

ルール：

- 記事ディレクトリ名と `canonicalPath` を一致させる。
- `canonicalPath` は `/articles/{articleSlug}` にする。
- `categorySlug` は既存カテゴリに合わせる。新カテゴリを作る場合だけカテゴリも追加する。
- `categoryLabel` はカテゴリの `title` に合わせる。
- `readingMinutes` は数値で書く。本文を書いた後に見積もる。
- 新規記事は基本 `featured: false` にする。
- `keywords` と `relatedSlugs` はカンマ区切り文字列にする。

## カテゴリfrontmatter

必須：

```md
---
slug: "shift-request"
title: "LINEでシフト希望を集める"
description: "困りごとカードとカテゴリヒーローに出る短い説明"
breadcrumbLabel: "LINEでシフト希望を集める"
pointTitle: "このカテゴリのポイント"
pointDescription: "カテゴリページの説明ブロック本文"
concerns: "悩み1, 悩み2, 悩み3, 悩み4"
representativeSlug: "line-shift-collection-guide"
relatedConcernSlugs: "excel-recording, submit-status"
ctaTitle: "カテゴリ別CTA見出し"
ctaDescription: "カテゴリ別CTA説明"
---
```

ルール：

- `slug` はディレクトリ名と一致させる。
- カテゴリは読者の悩み単位にする。
- `concerns` は3〜4個を目安にする。
- `representativeSlug` は初めて読む人に最も役立つ記事にする。
- `/articles` の困りごと一覧に出す場合は `content/pages/articles.md` の `concernSlugs` に追加する。

## Markdownで使える表現

- `##` と `###`
- 段落
- 箇条書き
- 番号付きリスト
- 引用
- 表
- 水平線
- 画像：`![alt](src "caption")`
- 画像属性：`![alt](src "caption"){width=360 align=right}`
- mediaブロック

mediaブロック：

```md
::: media align=right width=360
![シフト希望フォーム](./form.webp "希望提出の例")

希望を1か所に集めると、未提出の確認がしやすくなります。
:::
```

注意：

- `#` 見出しは本文レンダリングでスキップされる。記事タイトルはfrontmatterの `title`。
- H2が3つ以上あると目次が出る。
- `align` は `left`、`center`、`right`。
- 画像は記事ディレクトリからの相対パスを基本にする。
- 独自Markdown拡張を、ArticleSite以外で同じ見た目になる前提にしない。

## 確認コマンド

記事・カテゴリを変更したら実行する。

```bash
pnpm vitest --project=logic src/components/features/ArticleSite/articleContent.test.ts
pnpm lint
pnpm type-check
```

ローカルサーバーがすでに起動している場合は確認する。

- `/articles/{slug}` のPC表示
- `/articles/{slug}` の390x844程度のSP表示
- カテゴリを変更した場合は記事一覧とカテゴリページ
