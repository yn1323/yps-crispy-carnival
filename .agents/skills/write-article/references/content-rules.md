# シフトリ記事コンテンツルール

## Purpose

Write SEO/help articles for people who create shifts. Broaden search entry points for シフトリ while giving sincere, useful solutions that work before a reader adopts any tool.

Do not make the article primarily about シフトリ. First help the reader improve with paper, Excel, LINE, Google Forms, templates, clearer rules, or better communication. Introduce シフトリ only at the end when the topic naturally matches a verified feature.

## Language And Tone

Public article titles, headings, metadata, alt text, and body text must be Japanese unless the user explicitly requests another language.

Use `シフトリ` as the product name in public-facing content. Do not use `Shiftori` in article titles, body, metadata, or image alt text unless quoting code or a file path.

Use natural Japanese `です・ます` prose. Avoid English-like headings, literal translations, and internal product jargon. Slugs, file names, code identifiers, and URLs can use lowercase romanized English.

## Article Types

Use the user's requested type when provided. Otherwise choose:

- `文例型`: for reminder messages, request messages, sharing messages, and wording concerns. Must include copy-paste-ready examples and tone notes.
- `テンプレート型`: for shift request sheets, Excel tables, early/late/night tables, and formats. Must include table examples and fields.
- `やり方解説型`: for how to collect requests, make a shift table, organize categories, or share confirmed shifts. Must include ordered steps.
- `比較/選び方型`: for paper vs Excel vs LINE vs Google Forms vs tools. Must include fair tradeoffs and avoid pushing シフトリ too early.
- `失敗回避型`: for duplicate submissions, unsubmitted staff, scattered LINE requests, version confusion, or transfer mistakes. Must include common failures and countermeasures.

## One-Article Scope

Each article must narrow:

- Main pain
- Main keyword
- Primary search intent
- Reader
- What the reader can do after reading
- What the article will not cover deeply
- Whether シフトリ appears, and how lightly

Never pack shift-table creation, LINE collection, Excel templates, free-tool comparison, and all シフトリ features into one article.

## Brief Template

Create this before article body. The brief is a thinking aid and review aid, not the article itself.

```md
# 1. 記事ブリーフ

## 記事テーマ
## 記事タイプ
## 主キーワード
## 主検索意図
## 想定読者
## 読者の悩み
## この記事で解決すること
## この記事で深く扱わないこと
## 参照した一般的なシフト管理の悩み
## 参照した過去記事
## 過去記事との違い
## 内部リンク候補
## コードから確認したシフトリ機能
## コードから確認したが紹介しない機能
## シフトリ紹介の有無
## シフトリ紹介の温度感
## 画像案
```

Do not paste the brief into `content/articles/{slug}/index.md`. Public article Markdown should contain only frontmatter and reader-facing article content.

The brief does not force the final article structure. After the brief clarifies scope and risks, write the actual article freely so it reads naturally for the reader. Do not mechanically output every brief heading as an article section.

## Structure

Default flow:

1. Name the reader's problem briefly.
2. State what the article explains.
3. Give the conclusion early.
4. Explain the basic idea.
5. Give tool-free or existing-tool solutions.
6. Explain realistic operations with Excel, paper, LINE, or Google Forms.
7. Show common mistakes and cautions.
8. Include a usable table, template, message, checklist, OK/NG example, or format.
9. If natural, introduce only the relevant シフトリ capability lightly.
10. Summarize.

Delete chapters that do not fit the article type, but keep practical tool-free help unless impossible.

## Title And Heading Rules

- Include the main keyword and the concrete reader benefit.
- Make title and page content match.
- Avoid hype, shock, and keyword stuffing.
- Make H2 headings readable as a story by themselves.
- Put each H2's conclusion immediately after the heading.
- Avoid generic headings such as `シフト管理とは`, `シフト管理の重要性`, and `シフト管理システムの活用`.

## Body Rules

- Write for busy shift creators reading on smartphones.
- Keep one paragraph around 2-3 sentences.
- Put the answer near the top.
- Use tables, lists, examples, and checklists.
- Avoid abstract phrases such as `効率化できます` unless you explain which work gets easier.
- Do not dismiss paper, Excel, LINE, or Google Forms.
- Be honest about limits when staff count, shift categories, or deadline changes become hard to manage.
- Do not inflate word count with generic background.

Word count is not fixed. Use roughly:

- Light problem solving: 1,500-2,500 Japanese characters
- How-to or template: 2,500-4,000 Japanese characters
- Comparison or selection: 3,000-5,000 Japanese characters

Reader usefulness beats length.

## External Research

Use web search when current external facts matter or when the article touches external products, public guidance, or current recommendations.

Use official or primary sources whenever possible, especially for:

- LINE or Google Forms behavior, requirements, or limits
- Search/SEO guidance
- External tool comparisons
- Public statistics or current market context

Do not use web search as a substitute for code reading when describing シフトリ features. Product claims must come from the current repository.

## Labor And Legal Topics

Do not create articles centered on labor, legal, payroll, attendance, or compliance topics. Avoid topics such as breaks, consecutive workdays, late-night work rules, minors, overtime, paid leave, wage calculation, legal compliance checks, and employment-law advice.

If a user asks for this kind of article, explain that シフトリ content avoids labor/legal advice and suggest a safer operational topic such as希望回収, 未提出確認, Excel転記, 勤務区分の整理, or 確定シフト共有.

If a minor legal-adjacent caution is unavoidable, keep it brief, do not give legal advice, and direct the reader to official information or a qualified professional instead of making a definitive claim.

## シフトリ Mention Rules

Mention シフトリ only when all are true:

- The capability is verified from current code, route, UI, LP, or demo.
- The user can actually reach and use it.
- It naturally helps with the article's problem.
- It does not exceed the current product scope.
- It does not conflict with LP or demo positioning.

Keep the mention near the end and limited to the relevant work:

- Request collection article: request submission and submission status.
- Early/late/night article: submission by work category if verified.
- LINE article: LINE notification or submission route if verified.
- Excel transfer article: collecting requests and reducing transfer work.
- Sharing article: confirmed-shift sharing if verified.

Good temperature:

```md
ExcelやLINEでの運用を整えるだけでも、シフト作成は進めやすくなります。ただ、希望回収や未提出確認、確定シフトの共有が毎回負担になってきた場合は、シフトリのようにシフト希望の提出状況をまとめて確認できるツールを使う方法もあります。
```

## Do Not Claim

Do not write unless verified and intentionally promoted:

- Attendance management
- Payroll calculation
- Labor management or legal compliance checks
- Fully automatic optimal shift creation
- AI creates shifts automatically
- Complete support for every industry
- Permanently free
- LINE official account requirements without code confirmation
- Notification features not verified
- Any feature not present in シフトリ

Avoid strong free positioning, AI positioning, all-feature introductions, industry over-specialization, and aggressive CTAs.

## SEO Notes

For each article, prepare:

- `title`
- `meta description`
- `slug`
- `og:title`
- `og:description`
- OG image note: use the same OG policy/assets as the landing page unless the user gives a new policy.
- Article or BlogPosting structured-data memo
- BreadcrumbList memo
- Related articles
- Internal links
- Image alt text

Write unique, accurate title and description values. Do not use a target word count as an SEO rule.
