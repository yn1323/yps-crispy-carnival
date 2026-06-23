# ArticleSite実装リファレンス

現在の実装と違う場合は、必ず `src/components/features/ArticleSite/AGENTS.md` と `articleContent.ts` を優先します。

## パス

- 記事一覧ページ：`src/components/features/ArticleSite/content/pages/articles.md`
- カテゴリ：`src/components/features/ArticleSite/content/categories/{categorySlug}/index.md`
- 記事：`src/components/features/ArticleSite/content/articles/{articleSlug}/index.md`
- Sitemap：`public/sitemap.xml`
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
- サムネイル専用frontmatterや専用画像は作らない。記事カード用だけの画像追加やサムネイル管理はしない。
- SEO記事用画像は枠線や外枠を入れず、画像内の線がキャンバス端に触れないようにする。

## sitemap.xml

記事やカテゴリの公開URLを変えたら、`public/sitemap.xml` も更新します。

更新が必要なケース：

- 新規記事を追加した。
- 既存記事のslugや `canonicalPath` を変えた。
- 既存記事を削除、非公開、統合した。
- 新規カテゴリを追加した。
- カテゴリslugを変えた。
- 記事一覧ページやカテゴリページの内容を変えた。

記事URLの例：

```xml
  <url>
    <loc>https://shiftori.app/articles/{articleSlug}</loc>
    <lastmod>2026-06-23</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
```

カテゴリURLの例：

```xml
  <url>
    <loc>https://shiftori.app/articles/categories/{categorySlug}</loc>
    <lastmod>2026-06-23</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
```

ルール：

- `<loc>` は `https://shiftori.app` から始まる絶対URLにする。
- 記事URLは `canonicalPath` と一致させる。
- 記事の `<lastmod>` は記事frontmatterの `updatedAt` に合わせる。
- 新規記事を追加したら `/articles` の `<lastmod>` も必要に応じて更新する。
- 新規カテゴリを追加したら `/articles/categories/{categorySlug}` を追加し、`/articles` の `<lastmod>` も必要に応じて更新する。
- 削除・統合した記事やカテゴリのURLを残さない。

## index確認

ArticleSiteの記事を検索対象にしたい場合は、実装上のindex可否を確認します。

確認すること：

- `public/robots.txt` で `/articles`、`/articles/{slug}`、`/articles/categories/{categorySlug}` がブロックされていない。
- 対象routeの `buildMeta` に `noindex: true` が指定されていない。
- 対象routeにcanonicalがある。
- `public/sitemap.xml` に対象URLがある。
- `scripts/prerender.ts` の対象に記事一覧、記事詳細、カテゴリ詳細が含まれている。
- トップページ、ヘッダー、フッター、記事一覧、関連記事など、クロールしやすい内部リンクがある。

コード上でindex可能でも、Googleに実際にindexされるとは限りません。
公開後はSearch ConsoleのURL検査、カバレッジ、サイトマップ送信状態で確認します。

## サイトリンクを狙うとき

検索結果でアプリ名の下に複数リンクを出す「サイトリンク」は、Googleが自動で選びます。
HTMLや構造化データで、任意のリンクを直接指定することはできません。

やること：

- 重要ページに、トップページや共通ナビからリンクする。
- ヘッダーやフッターに、記事一覧、主要カテゴリ、主要機能ページへの自然な導線を置く。
- 記事一覧から各記事へ説明的なアンカーテキストでリンクする。
- 関連記事から近いテーマの記事へリンクする。
- ページタイトル、H1、H2、リンクテキストを短く具体的にする。
- 重複記事や似たタイトルを増やさない。
- `public/sitemap.xml` を更新する。

注意：

- `sitemap.xml` だけではサイトリンクは出ません。
- LPの該当セクションがコメントアウトされている、ヘッダーやフッターから記事一覧にリンクしていない、関連記事が少ない、などの場合はサイトリンク候補として弱くなります。
- サイトリンクに出したいページは、検索者がブランド名で検索したときに役立つ主要導線として扱います。

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

`public/sitemap.xml` も目視確認します。
新規記事、新規カテゴリ、slug変更、公開対象の削除があった場合は、該当URLと `lastmod` が正しいことを確認します。

ローカルサーバーがすでに起動している場合は確認する。

- `/articles/{slug}` のPC表示
- `/articles/{slug}` の390x844程度のSP表示
- カテゴリを変更した場合は記事一覧とカテゴリページ
