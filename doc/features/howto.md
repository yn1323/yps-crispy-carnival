# 使い方とヘルプ

シフトリを利用中の店舗運営者とスタッフが、操作方法、通知の仕組み、困ったときの対処を確認する公開ヘルプである。
一つの回答を一つのMDXで管理し、すべての回答を `/howto` にまとめて表示する。

## 関連ファイル

- `src/routes/howto.tsx`：URL境界
- `src/pages/howto/index.tsx`：ページ入口
- `src/pages/howto/meta.ts`：メタデータ
- `src/components/features/HowToSite/index.tsx`：検索、分類別ナビゲーション、回答一覧
- `src/components/features/HowToSite/helpContent.ts`：MDX読込、frontmatter検証、分類、検索
- `src/components/features/HowToSite/mdxComponents.tsx`：本文用の表示部品
- `src/components/features/HowToSite/content/*.mdx`：回答本文
- `src/components/features/HowToSite/helpContent.test.ts`：読込と検索のLogic Test
- `src/components/features/HowToSite/index.stories.tsx`：ページ全体の代表状態
- `scripts/prerender.ts`、`public/sitemap.xml`：静的HTMLと公開URL

コードとMDXを現在仕様の正本とする。
回答の追加と更新には `write-help-content`、UIの設計判断には `doc/rules/ui-design.md` を使う。

## 画面

| パス | 内容 |
|---|---|
| `/howto` | ヘルプ検索、分類別ナビゲーション、回答一覧 |
| `/howto#slug` | 同じページ内の特定回答 |

PCでは分類別ナビゲーションと回答を並べ、SPでは一列に表示する。
回答を読むための開閉操作と個別記事ページは設けていない。

## コンテンツ

各MDXは `title`、`description`、`category`、`keywords`、`features`、`related`、`order` をfrontmatterに持つ。
許可する値と検証条件は `helpContent.ts`、本文の現在内容は各MDXを正本とする。

検索対象はタイトル、description、カテゴリ、keywords、本文である。
回答の件数はMDXファイルから確認する。

FAQは短い結論と注意点、HowToは画面上の場所、操作、結果、失敗時の対処を担当する。
同じ説明を複製せず、FAQから必要なHowToへ案内する。

## API

Convex API、認証状態、実ユーザーデータには接続しない。
公開済みの内容を静的に表示する。
