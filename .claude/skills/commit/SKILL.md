---
name: commit
description: 変更を論理単位で分析し、自動で複数コミットに分割して作成する。「コミットして」「/commit」などのトリガーで発動。
---

# Auto-Commit

現在の変更（staged + unstaged + untracked）を分析し、論理単位ごとに分割して自動コミットする。

## ワークフロー

### 1. 品質チェック

```bash
pnpm lint
pnpm type-check
```

失敗したら修正してから再実行。自動修正可能な場合は `pnpm format` で修正。

### 2. 変更の収集

```bash
git status          # -uall禁止
git diff            # unstaged
git diff --cached   # staged
```

変更なしなら「コミットする変更がありません」と報告して終了。

### 3. 除外ファイル（絶対にコミットしない）

- `.env*` / credentials / secrets系

これらが変更に含まれる場合は `git checkout` で戻すか、ステージングから除外する。

### 4. 論理グループへの分割

**同一グループにすべきもの:**
- Convex schema変更 + 関連する queries/mutations/policies
- コンポーネント + そのStory (.stories.tsx)
- routes/ + pages/ + features/ が同一機能に属する場合
- テストファイル + テスト対象ファイル
- 同一ドメイン（Shop, Shift, Staff等）の一連の変更

**分離すべきもの:**
- feat vs fix vs refactor vs chore（種類が異なる変更）
- 無関係なドメインの変更
- ドキュメントのみの変更
- 依存関係の更新

**判断基準:** 「このコミットを revert したとき、意味のある単位で元に戻るか？」

### 5. コミット作成

各グループについて順番に：

1. `git add <対象ファイル>` で個別にステージング（`git add .` / `git add -A` 禁止）
2. HEREDOCでコミットメッセージを渡す:

```bash
git commit -m "$(cat <<'EOF'
<type>: <日本語の簡潔な説明>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 6. 完了報告

作成したコミット一覧を `git log --oneline` で表示。

## コミットメッセージ

- **type**: feat / fix / refactor / chore / docs / test
- **説明**: 「何が変わるか」を日本語で簡潔に
- scope括弧なし（プロジェクト慣習）
- PR番号なし（PRマージ時に付与）

例:
- `feat: スタッフ用シフト提出ページの追加`
- `fix: シフト一覧の日付ソートが逆順になる問題を修正`
- `refactor: ShiftFormの状態管理をJotaiに移行`

## 禁止事項

- `git add -i` / `git rebase -i` など対話的コマンド
- `--amend`（失敗時は新規コミット）
- `--no-verify`（フック省略禁止）
