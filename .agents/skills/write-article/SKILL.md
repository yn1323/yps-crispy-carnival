---
name: write-article
description: Create or update シフトリ SEO/help articles for src/components/features/ArticleSite, including article briefs, article type selection, category choice or creation, Markdown frontmatter/body, internal links, co-located 256x256 transparent PNG/WebP image assets, and quality checks. Use when the user asks to write, generate, add, revise, or plan articles, article candidates, categories, or article images for シフトリ, ArticleSite, features/articlePage, or SEO content aimed at shift creators.
---

# Write Article

Use this skill to create practical シフトリ articles for people who make shifts. The goal is not to sell シフトリ first; solve the reader's shift-work problem honestly, then mention シフトリ only when the article topic naturally connects to a verified product capability. Public article titles, metadata, and body text must be Japanese unless the user explicitly requests otherwise.

## Required Reading

Before writing article text, read:

- `doc/rules/testing-strategy.md`
- `src/components/features/ArticleSite/AGENTS.md`
- `src/components/features/ArticleSite/articleContent.ts`
- Existing files under `src/components/features/ArticleSite/content/`
- `scripts/prerender.ts`
- `public/sitemap.xml`
- `public/robots.txt`
- `references/content-rules.md`
- `references/article-site.md`

Before creating images, also read:

- `references/image-guidelines.md`
- View `public/sample-touch.png` in the current repository.

If the article will mention シフトリ behavior, verify the current implementation from source code, routes, UI copy, LP, or demo pages. Do not rely on a fixed feature database. If Convex files are needed for verification, read `convex/_generated/ai/guidelines.md` before reading or editing Convex code.

## Workflow

1. Clarify the task shape.
   - If the user specifies an article type, use it.
   - If not, choose one from `文例型`, `テンプレート型`, `やり方解説型`, `比較/選び方型`, or `失敗回避型` based on past articles, categories, search intent, and verified シフトリ capabilities.
   - Ask the user only when the topic is missing, the primary search intent is too vague, the request duplicates an existing article, or product-claim policy is unclear.

2. Inspect existing content.
   - List current article slugs, titles, categories, primary search intents when inferable, and related article opportunities.
   - Decide whether to use an existing category or create a new one.
   - If creating a category, create the category Markdown together with the article and update list/category relationships as described in `references/article-site.md`.
   - Check whether the new article/category is covered by `scripts/prerender.ts`, `public/sitemap.xml`, and `public/robots.txt`; update these public artifacts when the article should be publicly reachable.

3. Build an article brief before writing.
   - Include topic, main keyword, primary search intent, reader, pain, scope, out-of-scope items, referenced past articles, difference from past articles, internal link candidates, verified シフトリ features, features intentionally not mentioned, whether to introduce シフトリ, and the introduction temperature.
   - Keep one article to one primary problem and one primary search intent.
   - Treat the brief as scaffolding for thinking and review. Never paste the brief into the public article Markdown.

4. Draft the article.
   - Start from the reader's concrete problem and a short conclusion.
   - Provide tool-free solutions using paper, Excel, LINE, Google Forms, or process changes where appropriate.
   - Include at least one immediately usable element: table, template, message example, checklist, OK/NG example, Excel example, LINE example, or shift request format.
   - Keep paragraphs short for smartphone readers.
   - Avoid generic openings like `シフト管理とは`.
   - Avoid labor-law topics such as breaks, consecutive workdays, late-night work rules, minors, overtime, legal compliance, and payroll. Do not create articles centered on labor or legal advice.

5. Add images when they help understanding.
   - Generate article/category images as 256x256 transparent PNGs, convert each to WebP, keep both files co-located with the Markdown, and reference only WebP from Markdown.
   - Do not use these 256x256 images as the OG image unless the user explicitly changes policy. For `og:image` notes, use the same OG asset policy as the landing page.
   - Follow `references/image-guidelines.md` and run `scripts/convert_article_image.sh`.
   - Reject and regenerate images that contain text, are not transparent, do not match the sample touch, or are unclear at 256x256.

6. Implement Markdown content.
   - Create or edit `content/articles/{articleSlug}/index.md`.
   - Create or edit `content/categories/{categorySlug}/index.md` when needed.
   - Update `content/pages/articles.md` only when category display order or list metadata should change.
   - Keep `featured: true` limited to one article unless the user explicitly asks otherwise.

7. Verify.
   - Run the targeted ArticleSite logic test after Markdown/schema changes:
     `pnpm vitest --project=logic src/components/features/ArticleSite/articleContent.test.ts`
   - Run `pnpm lint` and `pnpm type-check` when implementation changes are made, or when the user expects a complete repo-ready change.
   - If image rendering or layout changed, inspect Storybook or the local ArticleSite surface if available; do not start dev/storybook servers unless the user asked, because this repo assumes the user runs them.
   - Run `git diff --check`.

8. Self-review.
   - Apply `references/quality-checklist.md`.
   - Remove filler, duplicated sections, unsupported product claims, and keyword stuffing.
   - Confirm the article lets the reader take the next step without using シフトリ.

## Output Expectations

For planning/candidate requests, output article candidates with title, main keyword, article type, primary search intent, central pain, category decision, past-article difference, シフトリ mention policy, internal links, image ideas, and priority.

For implementation requests, create the files. In the final response, summarize the article, category work, image assets, and verification results. Mention any checks not run.
