---
name: create-pr
description: GitHubにPull Requestを作成するスキル。コミット・プッシュ済みのブランチ差分を分析し、japanese-tech-writingを併用して、Summary/Changesと変更点ごとの確認項目を含む簡潔な日本語PR本文を作る。「PRを作成して」「プルリクエストを作って」「PR作って」などのトリガーで発動。
---

# PR作成スキル

## 前提条件

- コミット済み
- プッシュ済み
- GitHubリポジトリと連携済み

## 併用スキル

PRタイトルと本文を書く前に、必ず `.agents/skills/japanese-tech-writing/SKILL.md` を読む。
本スキルには文章規範を複製せず、日本語表現の判断は `japanese-tech-writing` に従う。

## ワークフロー

### 1. 現在のブランチ情報を取得

```bash
git branch --show-current
```

### 2. デフォルトブランチを自動検出

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
```

### 3. 変更内容を把握

デフォルトブランチとの差分コミットを取得:

```bash
git log <default-branch>..HEAD --oneline
```

詳細な変更内容を確認:

```bash
git diff <default-branch>...HEAD --stat
```

変更点ごとの確認項目を作るため、追加・変更されたテスト、Storybook、E2E、手動確認の記録も確認する。
テストコマンドの列挙だけで済ませず、「どの変更を、どの条件で、どう確認したか」を本文に残す。

### 4. PR本文を作る

PR本文は、レビュアーが差分を読む前に「なぜ」「何が変わったか」「どう確認されたか」を把握するために書く。
差分やコミットログの再説明にしない。

### 5. PRを作成

```bash
gh pr create --title "<タイトル>" --body "<本文>"
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

- PRのタイトルと本文は**日本語**で作成すること
- コミットメッセージを参考にしつつ、読み手にわかりやすい表現にする
- `Summary` と `Changes` で同じ内容を言い直さない
- `Changes` は最大3-5項目に絞る。ファイル単位ではなく、ユーザーに見える変化や責務単位でまとめる
- `Design` とmermaid図は標準では書かない。責務境界やデータフローを文章だけで誤読しやすい場合のみ `Notes` に置く
- UI変更でスクリーンショットや動画が必要な場合は、必要なときだけ `Notes` に置く
- 「重要」「包括的」「多角的」「正面から」など、情報を増やさない強調を避ける
