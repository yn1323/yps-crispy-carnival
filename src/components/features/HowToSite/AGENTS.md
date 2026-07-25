# HowToSite/AGENTS.md

このファイルは `src/components/features/HowToSite/` 配下へ適用する。
ルートと `src/AGENTS.md` を併せて読む。

## 正本

- 現在の機能概要と関連ファイルは `doc/features/howto.md` を参照する。
- frontmatter、category、slug、search、MDX componentの現在仕様は、対応するschemaと実装を正とする。
- ヘルプ記事の追加・編集では `write-help-content` を使う。
- 日本語本文は `japanese-tech-writing` を使い、長い説明に緩急が必要な場合だけ `cognitive-rhythm-writing` を併用する。

このファイルへ記事候補の分類、執筆手順、frontmatter全項目、現在の記事数を複製しない。

## 常時制約

- HowToSiteは、シフトリを利用中の管理者やスタッフが疑問を解消して作業へ戻るためのヘルプとして扱う。
- 機能を網羅するマニュアルや、検索流入のために長くしたSEO記事にしない。
- 1記事では一つの目的または困りごとだけを扱う。
- 冒頭で答えを示し、操作場所、結果、対象者、通知、再開方法のうち必要な情報だけを書く。
- UIを見れば分かる説明を繰り返さず、同じ迷いが多い場合は記事追加よりUI改善を検討する。
- 内部実装語を利用者向け本文へ出さない。
- 存在しない機能、確認できない仕様、推測した通知・権限・削除挙動を書かない。
- 記事を書く前に、関連するUI、機能文書、test、Convex実装で現在の挙動を確認する。
- 通知、認証、権限、token、個人情報を扱う記事では `shiftori-security-review` と `doc/rules/security-strategy.md` を使う。

## MDXと表示

- 個別記事は既存のcontent配置とslug規則に従う。
- 関連記事は、現在の問題を解決した後に起きる次の疑問だけを選ぶ。
- 画像や表示専用componentは、文章だけでは状態差や位置関係を伝えられない場合だけ使う。
- MDXからquery、mutation、認証状態、実データ、外部配送へ接続しない。
- AI生成画像を、正確な操作画面や実在するUIの代わりに使わない。
- 画像には補助する意味を説明するaltを設定する。

## テスト

- 個別記事のMDX本文やfrontmatterだけを変更する場合は、記事専用Storyやtestを追加しない。
- 共通layout、MDX変換、frontmatter、category、searchを変更した場合だけ、対応する既存testとStoryを更新する。
- 必要な検証コマンドは `write-help-content` と `package.json` を正とする。
