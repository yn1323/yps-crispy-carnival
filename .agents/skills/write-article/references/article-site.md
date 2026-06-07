# ArticleSite Technical Workflow

## Content Root

Work under:

```text
src/components/features/ArticleSite/
  content/pages/articles.md
  content/categories/{categorySlug}/index.md
  content/articles/{articleSlug}/index.md
  articleContent.ts
  index.tsx
```

Read `AGENTS.md` and `articleContent.ts` every run because frontmatter and Markdown support can change.

## Article Frontmatter

Use the current parser fields. At the time this skill was created, article files use:

```md
---
title: "記事タイトル"
description: "記事カード・記事ヒーロー・関連記事に出る1〜2文の説明"
publishedAt: "YYYY-MM-DD"
updatedAt: "YYYY-MM-DD"
categorySlug: "category-slug"
categoryLabel: "カテゴリ表示名"
author: "シフトリ編集部"
readingMinutes: 6
keywords: "キーワード1, キーワード2"
relatedSlugs: "article-slug-a, article-slug-b"
featured: false
canonicalPath: "/articles/article-slug"
ogTitle: "OGタイトル"
ogDescription: "OG説明"
---

# 記事タイトル
```

Rules:

- Directory name is the article slug.
- `canonicalPath` must be `/articles/{articleSlug}`.
- `categorySlug` must match an existing or newly created category.
- `categoryLabel` should normally match category `title`.
- Use the current Asia/Tokyo date for `publishedAt` and `updatedAt` unless the user specifies a date.
- Keep `featured: true` to one representative article by default.
- Keep `relatedSlugs` natural. If none exist, use an empty string and list future internal-link candidates in the brief.

## Category Frontmatter

When the article does not fit an existing category, create:

```md
---
slug: "category-slug"
title: "カテゴリ名"
description: "困りごとカードとカテゴリヒーローに出る短い説明"
breadcrumbLabel: "カテゴリ名"
pointTitle: "このカテゴリのポイント"
pointDescription: "カテゴリページの説明ブロック本文"
concerns: "悩み1, 悩み2, 悩み3"
representativeSlug: "article-slug"
relatedConcernSlugs: "other-category-slug"
ctaTitle: "カテゴリ別CTA見出し"
ctaDescription: "カテゴリ別CTA説明"
---
```

Rules:

- Directory name and `slug` must match.
- Use problem/search language, not internal feature names.
- Add 3-4 concrete concerns.
- Set `representativeSlug` to the best first article in the category.
- Add `relatedConcernSlugs` only when existing categories are meaningfully related.
- If the category should appear on the article list top, add it to `content/pages/articles.md` `concernSlugs` in a sensible order.

## Markdown Body

Use Markdown supported by the current parser. At creation time this includes:

- `##` / `###`
- Paragraphs
- Unordered and ordered lists
- Blockquotes
- Tables
- Horizontal rules
- Inline links
- Bold and inline code

The user plans to add image support separately. Assume images can be embedded, but still inspect the current parser. If image support is not present when implementing, either make the minimal ArticleSite image-support change or tell the user that image assets were created but cannot yet render, depending on the request.

When images are supported, reference WebP files from the co-located Markdown directory, not PNG files.

Do not include the article brief, SEO memo, quality checklist, or private planning notes in public Markdown. Article Markdown should contain frontmatter and reader-facing content only.

## Category Decision

Prefer existing categories when the search intent fits. Create a new category when:

- The reader's problem would make the existing category misleading.
- Multiple future articles can live under the new problem area.
- The topic is important enough for list/category navigation.

Avoid creating a category for a one-off angle that can live under an existing concern.

Good durable category areas for シフトリ content:

- Shift request collection
- Excel or paper transfer
- Unsubmitted status and reminders
- Shift planning by work category
- Confirmed-shift sharing
- Tool choice for small shops

## Public Artifacts

Article creation includes checking public routing/indexing artifacts:

- `scripts/prerender.ts`
- `public/sitemap.xml`
- `public/robots.txt`

At the time this skill was created, `scripts/prerender.ts` dynamically reads article and category slugs from `src/components/features/ArticleSite/content`, so a normal new article/category should already become a prerender target without editing `scripts/prerender.ts`. Still inspect it on each article task because this can change.

Update `public/sitemap.xml` when the article/category should be discoverable from public search. Confirm `public/robots.txt` does not accidentally block the new public route. Only edit `scripts/prerender.ts` when the current implementation no longer covers the new ArticleSite route shape.

## Product Claim Verification

Before mentioning シフトリ, inspect only the code and surfaces relevant to the article. Useful places include:

- Routes under `src/routes/`
- ArticleSite and LandingPage components
- Feature components under `src/components/features/`
- Pages under `src/components/pages/`
- Convex API files only if the article claim depends on backend behavior
- Demo or public flow files when the article points readers to a public route

If Convex code is needed, read `convex/_generated/ai/guidelines.md` first.

Record in the brief what was verified and what was intentionally not introduced.

## Verification Commands

For article/category Markdown changes:

```bash
pnpm vitest --project=logic src/components/features/ArticleSite/articleContent.test.ts
git diff --check
```

For parser/rendering/code changes:

```bash
pnpm lint
pnpm type-check
pnpm vitest --project=logic src/components/features/ArticleSite/articleContent.test.ts
git diff --check
```

Do not start `pnpm dev`, `pnpm storybook`, or `pnpm convex:dev` unless the user asks; this repository assumes the user runs those servers.
