# HelpCenter/AGENTS.md

このファイルは `src/components/features/HelpCenter/` 配下へ適用する。
ルートと `src/AGENTS.md` を併せて読む。

## 正本

- 現在の機能概要と管理形式は `doc/features/help-center.md` を参照する。
- frontmatter、task、relation、searchの現在仕様は、対応するschemaと実装を正とする。
- FAQ・使い方の追加と更新では `write-help-content` を使う。
- 日本語本文は `japanese-tech-writing` を使う。

## コンテンツ

- 利用者の「やりたいこと・困りごと」を先に選び、FAQと使い方を同じtaskへ所属させる。
- FAQは最初の一文で短く回答し、詳細な画面操作は書かない。
- 使い方は一つの目的だけを扱い、画面順の手順を書く。完了状態と失敗時の次の行動は、記事に必要な場合だけ加える。
- ボタン名とラベルは現在の実装と一致させ、将来予定や未確認の通知・権限・料金を現在事実として書かない。
- 同じ説明をFAQと使い方へ複製せず、`primaryGuide`と`related`で参照する。
- 画像は文章だけで操作場所や状態差を特定しにくい場合だけ使い、実画面の代わりにAI生成画像を使わない。
- MDXからAPI、認証状態、実データ、外部配送へ接続しない。

## テスト

- 個別本文だけの変更では記事専用testを追加しない。
- schema、task、relation、search、共通layoutを変えた場合は、対応するLogic TestまたはStoryを更新する。
- FAQと使い方のID、参照、task、公開状態はbuild前に検証できる状態を保つ。
