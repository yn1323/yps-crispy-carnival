# ヘルプセンター

> 文書種別: feature
>
> 最終コード照合: 2026-08-23（この変更を含む）

シフトリを利用中の管理者とスタッフが、やりたいことからFAQと詳しい使い方を探す公開ヘルプである。  
FAQと使い方は同じMDX管理基盤へ所属するが、FAQは短い回答、使い方は操作を完了するための手順として分ける。

## 公開URL

| パス | 内容 |
|---|---|
| `/help` | 検索、やりたいこと一覧、よく見られるFAQと使い方、選択したタスクの関連ヘルプ |
| `/help#task-<task-id>` | 対象のやりたいことを選択し、関連するFAQと使い方を表示するURL |
| `/help#<faq-id>` | 対象FAQを展開し、質問へフォーカスする共有URL |
| `/help/<guide-id>` | 使い方の個別ページ |

`/faq`と`/howto`は公開しない。  
旧URLのredirectとaliasも設けない。

## やりたいこと

各MDXは、次のいずれか一つへ所属する。

- 利用を始めたい
- 店舗を設定したい
- スタッフを追加・管理したい
- シフトを募集・回収したい
- 希望シフトを提出・変更したい
- シフトを作成・確定したい
- LINE・メール通知を確認したい
- 組織・管理者・料金を管理したい
- 困りごとを解決したい

ID、表示名、説明、対象者、表示順は`helpTasks.ts`を正本とする。  
タスクカードは選択状態を持ち、選択したタスクに属するFAQと使い方だけを一覧の下へ表示する。

## MDX

```text
src/components/features/HelpCenter/content/
├─ faqs/<id>/index.mdx
└─ guides/<id>/index.mdx
```

FAQと使い方は、共通のfrontmatterを使う。

| 項目 | 用途 |
|---|---|
| `kind` | `faq`または`guide` |
| `title` | 質問または操作名 |
| `task` | やりたいこととの関連付け |
| `audience` | `all`、`manager`、`staff` |
| `keywords` | 利用者が検索しそうな言い換え |
| `featureIds` | 仕様変更時に影響するヘルプを探す内部ID |
| `primaryGuide` | FAQから案内する主な使い方 |
| `related` | 主従関係ではない関連FAQ・使い方 |
| `order` | 同じtask・kind内の表示順 |
| `homeFeatured` | TOPと`/help`の初期表示へ掲載するFAQ |

slugとhrefはdirectory名とkindから生成する。  
検索結果の概要、SEO description、FAQ構造化データには、本文の最初の表示段落を使う。

`_`で始まるdirectoryは下書きである。  
下書きの本文とfrontmatterは公開バンドル、検索、静的生成、sitemapへ含めない。公開ヘルプからの参照を検証するため、下書きIDの存在だけをbuild時に使う。  
公開コンテンツから下書きへの`related`と`primaryGuide`は表示しないが、公開にも下書きにも存在しない参照は入力誤りとして拒否する。

## リレーション

タスクとコンテンツの関係は、各MDXの`task`から逆引きする。  
FAQから主な使い方への導線は`primaryGuide`から生成し、リンク文言は参照先のタイトルを使う。

使い方ページでは、その使い方を`primaryGuide`に指定したFAQを自動表示する。  
その他の関連コンテンツだけを`related`へ記載し、同じ関係を両方のMDXへ重複入力しない。  
`related`は表示時に双方向の関係として解決するため、片側だけの記載でも双方から移動できる。

## 検索

FAQと使い方を一つの検索欄から検索する。  
検索対象は、タイトル、本文の最初の段落、タスク名と説明、対象者、keywords、本文の表示テキストである。

入力はNFKC正規化、小文字化、空白の統一を行い、複数語はすべてを含むコンテンツだけを表示する。  
タイトル、keywords、最初の段落、タスク、本文の順に一致を優先し、同点ではタスク順、FAQ、記事順、IDで並べる。

`featureIds`、MDXコンポーネント名、JSX props、画像ファイル名は検索対象にしない。

## 表示と画像

`/help`の初期表示では、タスクカードの後に`homeFeatured`のFAQと、そのFAQが`primaryGuide`で参照する使い方だけを表示する。
タスクを選ぶと初期表示の一覧を置き換え、選択したタスクのFAQと使い方だけを種類別に表示する。
FAQはアコーディオンでその場に表示し、使い方は個別ページへのリンクとして表示する。
検索中はタスクカードと通常の一覧を隠し、検索結果のFAQと使い方だけを種類別に表示する。

使い方ページは、パンくず、対象者、本文、H2が3件以上ある場合の目次、関連FAQ、関連する使い方、問い合わせ導線を表示する。  
画像は使い方と同じdirectoryへ置き、相対pathをバンドルURLへ解決する。  
操作場所や状態差を文章だけで特定しにくい場合だけ画像を使い、意味のあるaltを設定する。

## 検証

build前に、frontmatter、kindと配置、task、feature ID、ID・タイトル・orderの重複、本文、primaryGuide、related、下書き参照を検証する。  
検索ロジックと構造化データはLogic Test、検索・FAQ展開などの操作はStorybook Behavior Test、PC・SPの代表レイアウトはVRTが担当する。

`/help`だけが全文検索用の本文テキストを読み込む。使い方ページでは対象slugのMDX本文・目次・画像だけを遅延読込し、他の使い方や全文検索データを先読みしない。  

`scripts/staticSite.ts`は公開中のguide directoryを走査し、`/help/<guide-id>`だけを静的生成する。  
sitemapは同じ公開route一覧から生成し、ヘルプには`lastmod`を付けない。

## 関連ファイル

- `src/routes/help.tsx`、`help.index.tsx`、`help.$slug.tsx`：URL境界
- `src/pages/help/`：ページ入口とhead
- `src/components/features/HelpCenter/helpMeta.ts`：軽量metadata、関係、構造化データ
- `src/components/features/HelpCenter/helpIndexData.ts`：`/help`だけが使う全文検索・FAQ回答テキスト
- `src/components/features/HelpCenter/helpSearch.ts`：共通検索
- `src/components/features/HelpCenter/faqContent.ts`、`guideContent.ts`：本文コンポーネントと目次
- `src/components/features/HelpCenter/HelpIndex.tsx`、`HelpGuide.tsx`：一覧と使い方詳細
- `src/components/features/HelpCenter/helpContent.test.ts`：管理形式と検索のLogic Test
- `scripts/staticSite.ts`、`scripts/sitemap.ts`：静的生成とsitemap

## API

Convex API、認証状態、実ユーザーデータ、外部通知には接続しない。  
公開済みのMDXを静的に表示する。
