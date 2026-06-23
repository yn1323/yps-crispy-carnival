# ArticleSite mock 編集ガイド

このディレクトリは、ArticleSite のモックや検討用アセットを置くための場所です。
現時点の公開記事MarkdownのSSOTは `src/components/features/ArticleSite/content/` です。

## Markdown形式

- ArticleSite のMarkdown frontmatter、本文記法、画像パースの仕様は `src/components/features/ArticleSite/AGENTS.md` と `src/components/features/ArticleSite/articleContent.ts` を優先してください。
- このディレクトリにモックMarkdownを置く場合も、公開側と同じfrontmatter・本文記法に合わせます。
- ArticleSite のMarkdown形式を変更した場合は、公開側の `src/components/features/ArticleSite/AGENTS.md` とこのファイルの両方を更新してください。

## 画像

- サムネイル専用画像は作成しません。
- 記事カード用だけの画像追加やサムネイル管理はしません。
- モック記事でも、記事上部の補助画像を出したい場合だけ `heroImageSrc` / `heroImageAlt` / `heroImageWidth` を用意してください。
- SEO記事用画像は枠線や外枠を入れず、画像内の線がキャンバス端に触れないようにします。
- 画像は記事ディレクトリに同梱し、WebPを優先します。
