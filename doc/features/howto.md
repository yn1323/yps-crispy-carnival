# 使い方・ヘルプ

シフトリを利用中の管理者やスタッフが、操作方法、通知の仕組み、困ったときの対処方法を短時間で確認する公開ヘルプ。
1項目1MDXで管理し、すべての項目を `/howto` の1ページにまとめて表示する。

## 関連ファイル

- `src/routes/howto.tsx` — `/howto` のURL定義とメタ情報
- `src/pages/howto/index.tsx` — ページ入口
- `src/components/features/HowToSite/index.tsx` — 検索、PCサイドナビ、SPページ内リンク、回答一覧
- `src/components/features/HowToSite/helpContent.ts` — MDX読み込み、frontmatter検証、カテゴリ、検索
- `src/components/features/HowToSite/mdxComponents.tsx` — MDX本文へ渡す表示専用コンポーネント
- `src/components/features/HowToSite/content/*.mdx` — ヘルプ本文
- `src/components/features/HowToSite/index.stories.tsx` — ページ全体のPC/SP VRT
- `src/components/features/HowToSite/helpContent.test.ts` — MDX読み込みと検索のLogic Test
- `vite.config.ts` — MDX、YAML frontmatter、GFMのビルド時変換
- `scripts/prerender.ts` / `public/sitemap.xml` — 静的HTML生成と公開URL

## 画面一覧

| パス | 内容 |
|---|---|
| `/howto` | ヘルプ検索、分類別ナビゲーション、回答一覧 |
| `/howto#slug` | 同じページ内の特定回答を直接表示 |

PCでは分類ナビを左側へ追従表示し、回答を読みやすい幅で右側へ並べる。
SPでは検索の下に分類リンクを置き、回答を1カラムで常時表示する。
短い回答を読むための開閉操作や個別記事ページは設けない。

## MDX

各MDXは `title`、`description`、`category`、`keywords`、`features`、`related`、`order` をfrontmatterに持つ。
検索はタイトル、description、カテゴリ、keywords、本文を対象とし、表記揺れはkeywordsで補う。

記事作成方針とfrontmatterの詳細は `src/components/features/HowToSite/AGENTS.md` をSource of Truthとする。

現在は、利用開始から募集、希望回収、シフト作成、確定、再通知までの全体の流れと、操作が止まりやすい困りごとを27項目で案内する。
本文は一文一行で管理し、操作、結果、例外など話題が変わる箇所は空行で区切って、画面上でも段落として表示する。

## API一覧

なし。
公開済みの仕様を静的に表示し、Convex API、認証状態、実ユーザーデータには接続しない。
