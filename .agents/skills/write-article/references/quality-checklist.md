# Article Quality Checklist

Run this before finishing.

## Reader Value

- The article answers one concrete shift-creation problem.
- The primary search intent stays stable.
- The reader can take action without シフトリ.
- The article includes a usable table, template, message example, checklist, OK/NG example, Excel example, LINE example, or request format.
- The opening gets to the point quickly.
- The article does not start with generic `シフト管理とは` background unless the user specifically asked for it.
- The public article Markdown does not include the article brief, private SEO memo, or quality checklist.
- The article title, headings, metadata, alt text, and body are Japanese.

## Content Integrity

- Past articles were checked for duplication.
- Internal links or future related article candidates are listed.
- シフトリ claims were verified from current code, route, UI, LP, or demo.
- Unverified, unfinished, internal, or unrelated features are not mentioned.
- The article does not claim attendance, payroll, labor compliance, fully automatic shift optimization, or AI shift creation unless explicitly verified and approved.
- Free positioning is not overstated.
- The article is not over-specialized to one industry unless the user asked for that industry.
- The article is not centered on labor, legal, payroll, attendance, or compliance advice.
- External product/current-fact claims were checked with official or primary web sources when needed.

## Writing Quality

- H2 headings tell the story by themselves.
- H2 sections start with a short conclusion.
- Paragraphs are short enough for smartphone reading.
- Lists and tables reduce scanning effort.
- Keywords appear naturally.
- There is no filler added only for word count.
- The シフトリ mention, if present, is near the end and modest.

## SEO And Metadata

- `title`, `description`, `ogTitle`, and `ogDescription` match the article.
- The slug is short, descriptive, lowercase, and hyphenated.
- `canonicalPath` matches `/articles/{slug}`.
- Category labels and breadcrumbs are natural for readers.
- OG image note follows landing-page policy unless the user changes it.
- Structured data notes are consistent with current ArticleSite behavior.

## Images

- Each referenced image has co-located PNG and WebP.
- Markdown references WebP only.
- PNG is retained but not referenced.
- Images are 256x256 with transparent background.
- Images contain no embedded text, title, or labels.
- Alt text is concise and useful.
- Images clarify nearby article content rather than decorating the page.
- Failed images were regenerated instead of being used.

## Public Artifacts

- `scripts/prerender.ts` was inspected; if it still dynamically reads ArticleSite slugs, no change is needed for normal article/category additions.
- `public/sitemap.xml` includes the new public article/category URLs when the article should be indexed.
- `public/robots.txt` does not block the intended public article/category routes.

## Repo Checks

- ArticleSite logic test passed or skipped with a clear reason.
- `pnpm lint` and `pnpm type-check` were run when code changed, or skipped with a clear reason.
- `git diff --check` passed.
