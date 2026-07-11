# ArticleSite 編集ガイド

このディレクトリは、シフトリのSEO向け記事サイトです。記事・カテゴリ・一覧トップの文言は主にMDXで管理し、レイアウトやSP/PCの見せ方は `index.tsx` で管理します。

## ファイル構成

```text
src/components/features/ArticleSite/
  content/pages/articles.mdx              # 記事一覧トップの文言・CTA・カテゴリ表示順
  content/categories/{categorySlug}/index.mdx
                                          # カテゴリページと困りごとカードの文言
  content/articles/{articleSlug}/index.mdx # 記事詳細ページのメタ情報・本文
  articleMeta.ts                          # frontmatterのzodスキーマ・SEOメタ（本文を含まない軽量な入口）
  articleContent.ts                       # MDX本文コンポーネントの読み込み・目次抽出
  mdxComponents.tsx                       # MDX本文のタグマッピングと記事用コンポーネント（ArticleImage / Media）
  index.tsx                               # 表示レイアウト・カード・SP/PC出し分け
```

MDXの変換は共有Viteプラグイン `vite/mdxPlugin.ts` が行います（`?mdx-component` / `?mdx-source` / `?mdx-frontmatter` / `?mdx-toc`）。
frontmatterはYAMLとしてパースされ、`articleMeta.ts` のzodスキーマで検証されます。
目次（`?mdx-toc`）や見出しidの共通ロジックは `src/helpers/mdx/` にあります。

## 記事一覧トップ: `content/pages/articles.mdx`

記事一覧トップのヒーロー文言、セクション見出し、共通CTA、よくある困りごとの表示順を管理します。

必須frontmatter:

```md
---
title: "シフト作成ガイド"
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
- ここにslugを追加しても、対応する `content/categories/{slug}/index.mdx` がないと表示できません。
- 一覧トップの新着記事は `publishedAt` の降順で表示されます。
- `landingPreviewTitle` / `landingPreviewDescription` / `landingPreviewLimit` / `landingPreviewLinkLabel` はLPのFAQ前に出す記事ミニ導線を制御します。記事そのものは `publishedAt` 降順の最新順です。
- LPの「お役立ち記事」には `publishedAt` が新しい順に4記事が表示され、SPでは2列、PCでは4列で並びます。各記事のHero画像がカード内の画像として再利用されます。公開日などを変更してLPの掲載記事を入れ替える場合は、新しく掲載される記事のHero画像も必ず用意または更新し、記事詳細上部とLPの記事カードの両方で内容が合っていることを確認してください。

## カテゴリ: `content/categories/{categorySlug}/index.mdx`

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

## 記事: `content/articles/{articleSlug}/index.mdx`

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
- `publishedAt` / `updatedAt` は `YYYY-MM-DD` 形式で、**必ず引用符つき**（`"2026-05-20"`）で書いてください。引用符がないとYAMLが日付型として解釈しビルドエラーになります。
- `keywords` / `relatedSlugs` などのリストは `"a, b"` 形式のカンマ区切り文字列、またはYAML配列のどちらでも書けます。
- 個別記事（`content/articles/{articleSlug}/index.mdx`）を追加・編集するだけなら、記事ごとの Story は作成不要です。
- 個別記事の本文・frontmatterだけを変更する場合は、個別記事専用の自動テストも不要です。MDXタグマッピング、frontmatter schema、記事一覧・カテゴリ・詳細レイアウトの挙動を変える場合だけ、既存のStoryやテストを更新してください。

任意frontmatter:

```md
heroImageSrc: "/lp/shiftForm.webp"
heroImageAlt: "シフト希望をフォームで提出する画面の例"
heroImageWidth: 340
```

- `heroImageSrc` を指定すると、記事上部のタイトル・説明ブロックに画像が表示されます。
- サムネイル専用画像や専用frontmatterは作成しません。LPの記事カードにはHero画像を再利用するため、カード用だけの画像追加やサムネイル管理は不要です。
- LPの記事カードの画像エリアは3:2比率です。Hero画像はトリミングせず、元の縦横比を保ったまま画像全体を表示します。
- PCでは記事メタ情報の右側、タブレット/SPではタイトル・説明の下に小さめの画像として表示されます。
- `heroImageSrc` を指定した場合、アクセシビリティ用の `heroImageAlt` は必須です。画面には表示されません。
- `heroImageWidth` はPC表示の横幅です。240〜360pxの範囲で指定してください。未指定時は320pxです。
- 画像パスは本文画像と同じく、`/lp/shiftForm.webp` のような `public/` 配下の絶対パス、またはMDXファイルと同階層に置いた `./image.webp` のような相対パスで参照できます。
- SEO記事用画像は枠線や外枠を入れず、画像内の線がキャンバス端に触れない範囲で、イラストをキャンバスいっぱいに配置してください。外周に広い空白を設けず、上下左右の余白は必要最小限にしてください。

### Hero画像の生成・採用手順

- Hero画像は `public/sample-touch.png` のタッチに合わせて生成してください。
- Hero画像は記事内容を補助する小さなイラストとして扱い、完成サイズを **640×480px（4:3）** に統一してください。生成元が別サイズの場合も、ユーザー確認用のPNGを書き出す前にこのサイズへ調整してください。
- LPの記事カードではHero画像をトリミングせず、白い余白で元の縦横比を保って表示します。小さいカードでも内容が伝わるよう、表、道具、アイコンなどの主要要素は画像中央へ配置してください。
- 小さなイラストを中央に置いて周囲を大きく空ける構図は避けてください。複数の要素を適度に広げ、640×480pxの表示領域を有効に使ってください。
- 生成する画像では人物イラストを控え、記事の内容を道具、表、画面、図形などで表現することを優先してください。
- 生成前に、ほかの記事の `heroImageAlt` を読み、既存のHero画像と構図や題材が重複しそうなイラストは控えてください。
- 生成した画像は、採用・配置・変換を進める前にユーザーへ提示し、その画像でよいか必ず確認を取ってください。
- ユーザーの確認が取れた画像だけをWebPへ変換してください。画質を保ちながら、圧縮後のファイルサイズは50KB程度を目標にしてください。

## 本文MDXで使える表現

MDX（remark-gfm有効）＋ `mdxComponents.tsx` のタグマッピングで次を表示できます。

- `## 見出し` / `### 小見出し`
- 段落
- 箇条書き `- item`
- 番号付きリスト `1. item`
- 引用 `> text`
- 表
- 水平線 `---`
- 画像 `![alt](src "caption")`（キャプション・中央寄せ・本文幅いっぱい）
- インラインリンク `[label](href)`
- 太字 `**text**`
- インラインコード `` `code` ``
- 記事用コンポーネント `<ArticleImage />`（サイズ・配置指定つき画像）
- 記事用コンポーネント `<Media>`（画像と短い文章の横並びブロック）

注意:

- `# 見出し` は本文レンダリングでは表示されません（`h1` は `null` にマッピング）。記事タイトルはfrontmatterの `title` が主です。
- H2が3つ以上ある記事だけ、記事詳細の目次UIが表示されます。目次はMDXソースのH2行から生成されます。
- 画像は `/lp/shiftForm.webp` のような `public/` 配下の絶対パス、またはMDXファイルと同階層に置いた `./image.webp` のような相対パスで参照できます。
- 画像の `"caption"` は任意です。指定すると画像下にキャプションとして表示されます。
- MDXでは `<` と `{` がJSX/式の開始として解釈されます。本文中に文字として書きたい場合は `\<` / `\{` とエスケープしてください。
- 本文は現時点では仮文章です。作り込みすぎず、SEO記事の構造が伝わる程度にしてください。

### 画像レイアウト用コンポーネント

画像単体のサイズと配置を指定するには `<ArticleImage />` を使います。

```mdx
<ArticleImage src="/lp/shiftForm.webp" alt="シフト希望フォーム" caption="希望提出の例" width={360} align="right" />
```

- `width` はpx数値で指定します。未指定なら本文幅いっぱいです。
- `align` は `"left"` / `"center"` / `"right"` を指定できます。未指定なら `center` です。
- スマホでは本文幅に収まるように表示されます。

画像の横に短い説明文を置きたい場合は、`<Media>` を使います。

```mdx
<Media align="right" width={360} image="/lp/shiftForm.webp" alt="シフト希望フォーム" caption="希望提出の例">
LINEのトークに希望が流れてしまう場合は、入力場所を1つにまとめると確認しやすくなります。
</Media>
```

- `align="right"` はPCで画像を右、文章を左に置きます。スマホでは文章、画像の順に縦積みします。
- `align="left"` はPCで画像を左、文章を右に置きます。スマホでは画像、文章の順に縦積みします。
- `<Media>` 内の文章は、短い段落向けです。見出し、表、リストなどの複雑な入れ子は使わないでください。

## 書き方の方針

- 大規模メディアではなく、「シフト作成で起きる困りごとを整理するガイド」の温度感にします。
- カテゴリ名は機能名よりも、店長・管理者が検索しそうな困りごとに寄せます。
- タイトル・descriptionは具体的にします。例: `LINEでシフト希望を集める方法`、`Excelでシフト表を作るのが大変になる理由`。
- 本文よりも、タイトル・カテゴリ・description・関連記事の自然さを優先してください。
- 記事上部の補助画像は `heroImageSrc` などのfrontmatterで指定してください。
- 記事本文に必要な画像はMDX本文へ追加してください。記事カードやOG画像を制御するfrontmatterはまだ追加しません。

## MDXで変えられること / React側で変えること

MDXで変えられること:

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

## 記事別OGP画像の再生成（記事の追加・更新時に必須）

記事を追加・更新（削除、`title` / `categoryLabel` の変更を含む）したら、**必ず** 次を実行し、生成された `public/ogp/articles/<slug>.png` を記事の変更と同じコミットに含めてください。

```bash
pnpm ogp:articles
```

- 日本語フォントのある環境（macOS / Windows、またはNoto Sans CJK導入済みLinux）で実行すること
- 実行を忘れると `pnpm prerender` が「Missing article OGP image(s)」エラーでビルドを失敗させます（CIには日本語フォントがないため、ビルド時生成ではなく生成物のコミットで運用しています）
- 生成ロジックは `scripts/generateArticleOgp.ts`。参照側のパス規約は `articleMeta.ts` の `getArticleOgpImagePath` と一致させること

## 追加・編集後の確認

ArticleSiteのMDXタグマッピング、frontmatter schema、一覧・カテゴリ・詳細レイアウトを変更したら、最低限次を実行してください。

```bash
pnpm vitest --project=logic src/components/features/ArticleSite/articleContent.test.ts
pnpm lint
pnpm type-check
pnpm build
```

個別記事のMDXだけを追加・編集した場合は、個別記事専用テストの追加やStory追加は不要です。既存の `Features/ArticleSite` Story やローカル画面で、記事ページが崩れていないか必要に応じて確認してください。

Storybookで確認する場合は `Features/ArticleSite` の List / Category / Article / Mobile 系Storyを見てください。SP確認は 390x844 程度の幅を目安にします。

## 編集時の注意点
- features/ArticleSite配下を修正する際は、 @public/sitemap.xml も確認し、必要であれば修正を加えること
- 記事の追加・更新時は「記事別OGP画像の再生成」セクションの `pnpm ogp:articles` を必ず実行すること
