# ArticleSite/AGENTS.md

このファイルは `src/components/features/ArticleSite/` 配下へ適用する。
ルートと `src/AGENTS.md` を併せて読む。

## 正本

- 現在の機能概要と関連ファイルは `doc/features/public-pages.md` を参照する。
- frontmatter、slug、MDX component、目次、画像pathの現在仕様は、対応するschemaと実装を正とする。
- `$seo-article-writer` は、ユーザーが明示した場合だけ使う。
- 日本語本文は `japanese-tech-writing` を使い、長い解説に緩急が必要な場合だけ `cognitive-rhythm-writing` を併用する。

このファイルへfrontmatter全項目、現在の記事数、component一覧を複製しない。

## 常時制約

- ArticleSiteは、シフト作成の困りごとを整理する公開SEO記事として扱う。
- タイトル、description、カテゴリは、内部の機能名ではなく利用者が検索する一般的な言葉で書く。
- 確認できない製品仕様、存在しない機能、効果を断定しない。
- 個別記事の内容だけを変える場合は、React側のschemaやlayoutを変更しない。
- 記事本文の `h1` に表示を依存せず、titleは既存frontmatter契約に従う。
- 日付はschemaが受け付ける形式で記述し、YAMLの暗黙型変換を避ける。
- 関連記事やカテゴリのslugは、実在するcontentと整合させる。
- 画像には意味のあるaltを設定し、装飾目的の画像を増やさない。
- 実在しないUIや本文にない仕様を、画像へ含めない。

## 生成物

- 記事の追加、削除、OGPに使うメタ情報の変更では、既存のOGP生成scriptを実行し、生成物を同じ変更へ含める。
- 記事URLを追加・削除した場合は、`public/sitemap.xml`を現在の形式に合わせて更新する。
- Hero画像を新規生成する場合は、採用と配置の前にユーザー確認を得る。
- 元画像はユーザーが削除を明示しない限り保持する。

## テスト

- 個別記事のMDX本文やfrontmatterだけを変更する場合は、記事専用Storyやtestを追加しない。
- MDX変換、frontmatter schema、一覧・カテゴリ・詳細layoutを変更した場合だけ、対応する既存testとStoryを更新する。
- 必要な検証コマンドは `package.json` と近い既存の変更を正とする。
