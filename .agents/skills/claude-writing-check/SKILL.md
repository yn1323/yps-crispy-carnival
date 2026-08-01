---
name: claude-writing-check
description: ユーザーが `$claude-writing-check` を明示したときだけ、Claude Fable 5をCLIの単発モードで呼び出し、状況、目的、文章要件、元原稿と二つの日本語文章規範を渡して、1文から記事全体までを執筆または推敲する。通常の文章作成・レビューでは自動的に使わない。
---

# Claudeで文章を推敲する

この Skill は、ユーザーが `$claude-writing-check` を明示した場合だけ使う。

## 入力を整理する

Claudeへ渡す前に、会話と対象原稿から次の情報を整理する。

- **状況**：文章が使われる場所、対象読者、前提となる背景
- **目的**：文章によって読み手に何を理解・判断・実行してほしいか
- **文章要件**：文体、長さ、構成、残す内容、避ける表現など
- **元の文章**：既存文章の編集・推敲である場合だけ渡す

会話から一意に判断できる情報は補ってよい。  結果を大きく変える情報が欠けている場合は、Claudeを呼ぶ前にユーザーへ確認する。

## Claudeを単発で呼ぶ

`scripts/run_claude_writing_check.py` を使う。  このスクリプトは毎回、次の規範を全文読み込み、Claudeへのsystem promptに含める。

- `../japanese-tech-writing/SKILL.md`
- `../cognitive-rhythm-writing/SKILL.md`

短い元原稿は `--source-text`、既存ファイルや記事全体は `--source-file` で渡す。

```bash
python3 .agents/skills/claude-writing-check/scripts/run_claude_writing_check.py \
  --context "読者と利用場面を含む状況" \
  --purpose "文章で達成する目的" \
  --instruction "どのような文章を書くか" \
  --source-file path/to/draft.md
```

Codexからこのスクリプトを実行するときは、`exec_command`へ`sandbox_permissions: "require_escalated"`を指定し、サンドボックス外で実行する。  macOSに保存されたClaude CLIの認証情報はサンドボックス内から参照できないため、通常のターミナルでログイン済みでも`Not logged in · Please run /login`になることがある。

認証状態だけを確認するときも、`claude auth status`をサンドボックス外で実行する。  サンドボックス内だけで未ログインになった場合は再ログインを案内せず、先にサンドボックス外の結果を確認する。

新規執筆では `--source-text` と `--source-file` を省略する。  状況、目的、文章要件が長い場合は、それぞれ `--context-file`、`--purpose-file`、`--instruction-file` でUTF-8ファイルを渡す。

スクリプトは次のClaude CLI設定を固定する。

- `--print`：会話を開始せず、応答を出力して終了する
- `--model claude-fable-5`：Fable 5の完全なモデル名を指定する
- `--effort medium`：effortを中段階に固定する
- `--no-session-persistence`：単発の依頼を履歴へ保存しない
- `--safe-mode --tools "" --strict-mcp-config`：文章推敲に不要な設定とtoolsを読み込まない

認証情報、秘密値、推敲に不要な個人情報はClaudeへ渡さない。

## 結果を返す

標準出力には完成した文章だけが返る。  前置き、講評、変更点の説明を加えず、その文章をユーザーへ返す。  ユーザーがファイルの更新も依頼した場合だけ、返された文章を対象ファイルへ反映する。

Claude CLIが失敗した場合は、自分で推敲した文章へ黙って置き換えず、エラーの要点をユーザーへ伝える。
