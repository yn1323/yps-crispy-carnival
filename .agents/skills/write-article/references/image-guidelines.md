# Article Image Guidelines

## Required Style Check

Before generating images, view `public/sample-touch.png` in the current repository. Match its direction:

- Simple black hand-drawn line art
- White and light gray fills
- Teal accent color close to シフトリ brand
- Soft, practical business illustration feel
- Calendar, smartphone, chat, checklist, table, staff, store, or shift-operation motifs
- Gentle rounded shapes and clear whitespace

Do not copy the sample image; learn the touch and create topic-specific assets.

## Asset Requirements

- Create a PNG first.
- Final PNG must be 256x256.
- Background must be transparent.
- Convert to WebP.
- Keep both `.png` and `.webp` in the same directory as the Markdown file that uses them.
- Reference only `.webp` in Markdown.
- Keep PNG out of Markdown.
- Use lowercase, hyphen-separated, descriptive filenames such as `line-request-format.png` and `line-request-format.webp`.

Use `scripts/convert_article_image.sh path/to/image.png` after PNG generation. The script normalizes the PNG to 256x256 and writes a same-name WebP while keeping the PNG.

## No Text In Images

Never place titles, headings, captions, labels, Japanese text, English text, numbers intended as labels, or UI copy inside article images unless the user explicitly requests it.

If the concept is a template, form, or table, represent it with abstract lines, cells, checkmarks, dots, and blocks instead of readable text.

If generated output contains any readable text, logo-like mark, title, label, nontransparent background, mismatched touch, or unclear subject, do not use it. Regenerate or revise the prompt until it passes the quality check.

## Prompt Pattern

Use prompts shaped like:

```text
Create a 256x256 transparent-background PNG icon illustration for a Japanese shift scheduling help article.
Style: simple black hand-drawn line art, white and light gray fills, teal accent color, soft rounded business illustration, generous whitespace, no text, no letters, no numbers, no logo, no title.
Subject: [specific article concept].
Composition: [one clear focal object or small scene].
```

Good subjects:

- A manager checking a smartphone beside a small calendar with teal checkmarks.
- A simple shift table with a pen and a teal checkmark.
- A LINE-like chat bubble and calendar represented without any text or app logo.
- A checklist of submitted staff requests shown with abstract checkmarks.
- A small storefront beside a calendar and paper form.

Avoid:

- Generic marketing people with no article-specific meaning.
- Dense scenes that become illegible at 256x256.
- Real screenshots unless the user explicitly requests screenshots.
- App logos, LINE logos, or brand marks unless verified and explicitly needed.
- Decorative images that do not help the nearby section.

## Placement

Place images near the section they clarify. Favor one to three useful images per article. Do not add images just to decorate.

Use article-level images for body sections. Use category-level images only when the ArticleSite implementation displays category/list images; store those in the category directory.

## Alt Text

Write concise, context-specific alt text. Describe the image's purpose near the surrounding text, not every visual detail.

Good:

- `LINEで届いたシフト希望をカレンダーに整理するイメージ`
- `早番と遅番の勤務区分を表で分けるイメージ`
- `未提出者をチェックリストで確認するイメージ`

Avoid:

- Keyword stuffing
- `画像`
- `イラスト`
- Repeating the adjacent sentence exactly

If an image is purely decorative and the renderer supports empty alt text, use empty alt. Most article images should be informative.

## Quality Check

After generation and conversion:

- View the PNG or WebP.
- Confirm it is 256x256.
- Confirm transparent background.
- Confirm there is no embedded text.
- Confirm the subject is understandable at small size.
- Confirm it matches `sample-touch.png` in tone.
- Confirm it is relevant to the exact section where it appears.
