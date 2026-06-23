# ArticleSite 編集ガイド

このディレクトリは、シフトリのSEO向け記事サイトです。記事・カテゴリ・一覧トップの文言は主にMarkdownで管理し、レイアウトやSP/PCの見せ方は `index.tsx` で管理します。

## ファイル構成

```text
src/components/features/ArticleSite/
  content/pages/articles.md              # 記事一覧トップの文言・CTA・カテゴリ表示順
  content/categories/{categorySlug}/index.md
                                          # カテゴリページと困りごとカードの文言
  content/articles/{articleSlug}/index.md # 記事詳細ページのメタ情報・本文
  articleContent.ts                       # Markdownの読み込み・frontmatter定義
  index.tsx                               # 表示レイアウト・カード・SP/PC出し分け
```

## 記事一覧トップ: `content/pages/articles.md`

記事一覧トップのヒーロー文言、セクション見出し、共通CTA、よくある困りごとの表示順を管理します。

必須frontmatter:

```md
---
title: "小さなお店のシフト作成ガイド"
description: "一覧トップの説明文"
breadcrumbLabel: "お役立ち情報"
concernTitle: "よくある困りごとから探す"
latestTitle: "新着記事"
ctaTitle: "共通CTA見出し"
ctaDescription: "共通CTA説明"
ctaPrimaryLabel: "シフトリを見てみる"
ctaPrimaryHref: "/demo/flow"
ctaSecondaryLabel: "無料で試してみる"
ctaSecondaryHref: "/signup"
concernSlugs: "shift-request, excel-recording, submit-status"
landingPreviewTitle: "シフト作成のヒント"
landingPreviewDescription: "LPの記事ミニ導線に出す説明文"
landingPreviewLimit: 3
landingPreviewLinkLabel: "記事一覧を見る"
---
```

- `concernSlugs` は一覧トップの「よくある困りごと」に出すカテゴリslugと表示順です。
- ここにslugを追加しても、対応する `content/categories/{slug}/index.md` がないと表示できません。
- 一覧トップの新着記事は `publishedAt` の降順で表示されます。
- `landingPreviewTitle` / `landingPreviewDescription` / `landingPreviewLimit` / `landingPreviewLinkLabel` はLPのFAQ前に出す記事ミニ導線を制御します。記事そのものは `publishedAt` 降順の最新順です。

## カテゴリ: `content/categories/{categorySlug}/index.md`

カテゴリページのヒーロー、一覧トップの困りごとカード、カテゴリ別CTAを管理します。

必須frontmatter:

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

- `slug` はディレクトリ名 `{categorySlug}` と一致させてください。
- `title` と `description` は、カテゴリページだけでなく一覧トップの困りごとカードにも使われます。
- `concerns` はカテゴリページの「このカテゴリで扱う悩み」に表示されます。3〜4個を目安にしてください。
- `representativeSlug` はカテゴリページの「まず読む記事」に表示する記事slugです。
- `relatedConcernSlugs` はカテゴリページ下部の「ほかの困りごともチェック」に出すカテゴリslugです。
- `ctaTitle` / `ctaDescription` は、そのカテゴリの記事詳細下部CTAに使われます。

## 記事: `content/articles/{articleSlug}/index.md`

記事詳細ページの記事メタ情報、関連記事、本文を管理します。

必須frontmatter:

```md
---
title: "LINEでシフト希望を集める方法"
description: "記事カード・記事ヒーロー・関連記事に出る1〜2文の説明"
publishedAt: "2024-05-20"
updatedAt: "2024-05-20"
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

# 記事タイトル

本文...
```

- ディレクトリ名 `{articleSlug}` が記事slugになります。
- `canonicalPath` は `/articles/{articleSlug}` にしてください。
- `categorySlug` は既存カテゴリのslugに合わせてください。
- `categoryLabel` は表示用ラベルです。基本はカテゴリの `title` と同じでOKです。
- `relatedSlugs` は記事詳細下部の関連記事候補です。指定が足りない場合は同カテゴリの記事が補完されます。
- `featured: true` は一覧トップなどでデフォルト表示する代表記事用です。基本は1記事だけにしてください。
- `readingMinutes` は数値で書いてください。
- `publishedAt` / `updatedAt` は `YYYY-MM-DD` 形式で書いてください。

任意frontmatter:

```md
heroImageSrc: "/lp/shiftForm.webp"
heroImageAlt: "シフト希望をフォームで提出する画面の例"
heroImageWidth: 340
```

- `heroImageSrc` を指定すると、記事上部のタイトル・説明ブロックに画像が表示されます。
- PCでは記事メタ情報の右側、タブレット/SPではタイトル・説明の下に小さめの画像として表示されます。
- `heroImageSrc` を指定した場合、アクセシビリティ用の `heroImageAlt` は必須です。画面には表示されません。
- `heroImageWidth` はPC表示の横幅です。240〜360pxの範囲で指定してください。未指定時は320pxです。
- 画像パスは本文画像と同じく、`/lp/shiftForm.webp` のような `public/` 配下の絶対パス、またはMarkdownファイルと同階層に置いた `./image.webp` のような相対パスで参照できます。

## 本文Markdownで使える表現

`articleContent.ts` の簡易parserで次を表示できます。

- `## 見出し` / `### 小見出し`
- 段落
- 箇条書き `- item`
- 番号付きリスト `1. item`
- 引用 `> text`
- 表
- 水平線 `---`
- 画像 `![alt](src "caption")`
- ArticleSite独自拡張の画像属性 `![alt](src "caption"){width=360 align=right}`
- ArticleSite独自拡張の横並びブロック `::: media align=right width=360`
- インラインリンク `[label](href)`
- 太字 `**text**`
- インラインコード `` `code` ``

注意:

- `# 見出し` は本文レンダリングではスキップされます。記事タイトルはfrontmatterの `title` が主です。
- H2が3つ以上ある記事だけ、記事詳細の目次UIが表示されます。
- 画像は `/lp/shiftForm.webp` のような `public/` 配下の絶対パス、またはMarkdownファイルと同階層に置いた `./image.webp` のような相対パスで参照できます。
- 画像の `"caption"` は任意です。指定すると画像下にキャプションとして表示されます。
- `{width=360 align=right}` と `::: media ...` は標準Markdownではなく、ArticleSite用の独自拡張です。ほかのMarkdownレンダラで同じ表示になるとは限りません。
- 本文は現時点では仮文章です。作り込みすぎず、SEO記事の構造が伝わる程度にしてください。

### 画像レイアウト拡張

画像単体のサイズと配置を指定できます。

```md
![シフト希望フォーム](/lp/shiftForm.webp "希望提出の例"){width=360 align=right}
```

- `width` はpx数値で指定します。未指定なら本文幅いっぱいです。
- `align` は `left` / `center` / `right` を指定できます。未指定なら `center` です。
- スマホでは本文幅に収まるように表示されます。

画像の横に短い説明文を置きたい場合は、mediaブロックを使います。

```md
::: media align=right width=360
![シフト希望フォーム](/lp/shiftForm.webp "希望提出の例")

LINEのトークに希望が流れてしまう場合は、入力場所を1つにまとめると確認しやすくなります。
:::
```

- `align=right` はPCで画像を右、文章を左に置きます。スマホでは文章、画像の順に縦積みします。
- `align=left` はPCで画像を左、文章を右に置きます。スマホでは画像、文章の順に縦積みします。
- mediaブロック内の文章は、短い段落向けです。見出し、表、リストなどの複雑な入れ子Markdownは使わないでください。

## 書き方の方針

- 大規模メディアではなく、「小さなお店のシフト作成で起きる困りごとを整理するガイド」の温度感にします。
- カテゴリ名は機能名よりも、店長・管理者が検索しそうな困りごとに寄せます。
- タイトル・descriptionは具体的にします。例: `LINEでシフト希望を集める方法`、`Excelでシフト表を作るのが大変になる理由`。
- 本文よりも、タイトル・カテゴリ・description・関連記事の自然さを優先してください。
- 記事上部の補助画像は `heroImageSrc` などのfrontmatterで指定してください。
- 記事本文に必要な画像はMarkdown本文へ追加してください。記事カードやOG画像を制御するfrontmatterはまだ追加しません。

## mdで変えられること / React側で変えること

mdで変えられること:

- 記事一覧トップの文言・CTA・困りごとの表示順
- LPの記事ミニ導線の見出し・説明文・表示件数・一覧リンク文言
- カテゴリ名・説明・扱う悩み・カテゴリ別CTA
- 記事タイトル・説明・カテゴリ・関連記事・本文・読了時間・記事上部の補助画像

React側で変えること:

- カードの見た目
- SP/PCの表示件数やレイアウト
- 目次の出し方
- CTAボタン数やレスポンシブ表示
- 仮アイコンやプレースホルダーのデザイン

## 追加・編集後の確認

Markdownを追加・編集したら、最低限次を実行してください。

```bash
pnpm vitest --project=logic src/components/features/ArticleSite/articleContent.test.ts
pnpm lint
pnpm type-check
pnpm build
```

Storybookで確認する場合は `Features/ArticleSite` の List / Category / Article / Mobile 系Storyを見てください。SP確認は 390x844 程度の幅を目安にします。
