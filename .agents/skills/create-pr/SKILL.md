---
name: create-pr
description: ユーザーが`$create-pr`を明示したとき、コミット済みの現在ブランチを必要に応じてpushし、日本語のPull Requestを作成する。通常のPR相談、本文案だけの依頼、未コミット変更の処理では自動的に使わない。
---

# Pull Requestを作成する

このスキルは、ユーザーが `$create-pr` を明示した場合だけ使う。

## 前提条件とpush権限

- 対象変更がコミット済みである。
- GitHubリポジトリと連携済みである。
- `$create-pr`の明示実行は、Pull Request作成に必要な現在ブランチの通常pushを許可したものとして扱う。

未コミット変更は勝手にコミットせず、Pull Requestへ含まれないことを報告する。
force push、rebase、mergeは行わない。
通常pushが拒否された場合は停止し、理由を報告する。

## 併用スキル

PRタイトルと本文を書く前に、`$japanese-tech-writing` を使う。
本スキルには文章規範を複製せず、日本語表現の判断は `japanese-tech-writing` に従う。

デフォルトブランチとの大規模なdiff・commit logを、Pull Request作成の判断から独立した事実へ圧縮できる場合だけ、`$delegate-bounded-repo-work`を併用する。
対象判定、固定model、委譲契約は同Skillを正本とする。
通常の差分確認、検証結果の確認、base・head、PRタイトルと本文、push、Pull Request作成は本Skillの親Agentが判断・実行する。
最後の関連変更より後に同じworkspace状態で成功した検証は再利用し、Pull Request作成段階へ進んだという理由だけで再実行しない。

## ワークフロー

### 1. 対象を確定する

```bash
git status --short
git branch --show-current
```

作業ツリーに未コミット変更がある場合は、PRへ含まれないことを明示する。

### 2. デフォルトブランチを確認する

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

現在のブランチがデフォルトブランチと同じ場合は、pushもPull Request作成も行わず停止する。

### 3. 差分と検証結果を確認する

デフォルトブランチとの差分コミットを取得:

```bash
git log <default-branch>..HEAD --oneline
```

詳細な変更内容を確認:

```bash
git diff <default-branch>...HEAD --stat
```

追加・変更されたテスト、Storybook、E2E、手動確認の記録も確認する。
テストコマンドの列挙だけで済ませず、「どの変更を、どの条件で、どう確認したか」を本文に残す。

### 4. PR本文を作成する

PR本文は、レビュアーが差分を読む前に「なぜ」「何が変わったか」「どう確認されたか」を把握するために書く。
差分やコミットログの再説明にしない。

### 5. 現在のブランチをpushする

upstreamとpush状況を確認する。

```bash
git status -sb
git rev-parse --abbrev-ref --symbolic-full-name '@{u}'
```

upstreamがある場合は通常pushする。

```bash
git push
```

upstreamがない場合は、現在のブランチを`origin`へpushしてupstreamを設定する。

```bash
git push -u origin <current-branch>
```

push済みなら追加操作は不要である。
`--force`または`--force-with-lease`は使用しない。

### 6. PRを作成する

```bash
gh pr create --base "<default-branch>" --head "<current-branch>" --title "<タイトル>" --body "<本文>"
```

## PR本文フォーマット（日本語で出力）

~~~markdown
## Summary

<!-- 背景と目的を1-2文で書く。差分の再説明や図は入れない。 -->

## Changes

- **変更点1**：変更後の挙動を一文で書く。

<details>
<summary>確認項目</summary>

- 〇〇のとき、〇〇すると、〇〇になることを確認した。

</details>

- **変更点2**：変更後の挙動を一文で書く。

<details>
<summary>確認項目</summary>

- 〇〇のとき、〇〇すると、〇〇になることを確認した。

</details>
~~~

## 確認項目の書き方

- 各 `Changes` の直後に `<details><summary>確認項目</summary>` を置く
- 確認項目は日本語のAAA形式で書く
  - Arrange: 〇〇のとき
  - Act: 〇〇すると
  - Assert: 〇〇になることを確認した
- `pnpm lint` や `pnpm type-check` など、実行コマンドだけを標準では書かない
- 変更に対応する確認を実施していない場合は、確認したように書かず、未確認の内容と理由を短く書く

## 注意事項

- PRのタイトルと本文は日本語で作成する
- コミットメッセージを参考にしつつ、読み手にわかりやすい表現にする
- `Summary` と `Changes` で同じ内容を言い直さない
- `Changes` は最大3-5項目に絞る。ファイル単位ではなく、ユーザーに見える変化や責務単位でまとめる
- `Design` とmermaid図は標準では書かない。責務境界やデータフローを文章だけで誤読しやすい場合のみ `Notes` に置く
- UI変更でスクリーンショットや動画が必要な場合は、必要なときだけ `Notes` に置く
- 「重要」「包括的」「多角的」「正面から」など、情報を増やさない強調を避ける
- 作成後はPRのURL、base、head、draft状態を報告する
