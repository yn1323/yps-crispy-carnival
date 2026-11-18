#!/bin/bash
# 型エラーを残したままターンを終えないようにするStopフック。
#
# AGENTS.mdの「検証」は文章の指示で、実行するかはモデルの判断に依存する。
# 型チェックだけは例外なく通したいので、ターン終了時にここで実行する。
# exit code 2で終了を差し戻し、stderrの内容がClaudeへ理由として渡る。

INPUT=$(cat)

# 一度差し戻した後は止めない。
# 型エラーが作業途中の別の変更に由来する場合に、ターンを終えられなくなるのを防ぐ。
STOP_HOOK_ACTIVE=$(printf '%s' "$INPUT" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("stop_hook_active", False))' 2>/dev/null)
if [ "$STOP_HOOK_ACTIVE" = "True" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# TypeScriptに関わる未コミットの変更がなければ検査しない。質問だけのターンを待たせないため。
if ! git status --porcelain --untracked-files=all -- '*.ts' '*.tsx' 'tsconfig*.json' package.json | grep -q .; then
  exit 0
fi

if ! OUTPUT=$(pnpm type-check 2>&1); then
  {
    echo "型チェック（pnpm type-check）が失敗しています。今回の変更が原因なら修正してください。"
    echo "今回の変更と無関係な、作業途中の別の変更が原因なら、修正せずにその旨をユーザーへ報告してください。"
    echo
    printf '%s\n' "$OUTPUT" | tail -n 60
  } >&2
  exit 2
fi

exit 0
