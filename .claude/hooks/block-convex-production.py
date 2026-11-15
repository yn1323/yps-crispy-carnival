#!/usr/bin/env python3
"""本番Convexへ到達するBashコマンドを止めるPreToolUseフック。

AGENTS.mdの「各Convex環境への接続」は、本番環境の閲覧と編集を禁止している。
文章の指示だけではモデルの判断に依存するため、ここで機械的に止める。

止める対象:
- 本番のdeployment名を含むコマンド（検索や表示だけのコマンドは除く）
- `convex ... --prod` と `convex deploy`
- 本番を指す CONVEX_DEPLOYMENT / CONVEX_DEPLOY_KEY の指定
- 本番modeで起動するanalytics-dashboardのscript

exit code 2で止め、stderrの内容がClaudeへ理由として渡る。
"""

import json
import re
import shlex
import sys

PROD_DEPLOYMENT = "proficient-kookabura-834"

# deployment名を引数に取っても本番へ接続しない、検索と表示のコマンド。
READ_ONLY_COMMANDS = {
    "awk",
    "cat",
    "cut",
    "diff",
    "echo",
    "find",
    "git",
    "grep",
    "head",
    "jq",
    "ls",
    "printf",
    "rg",
    "sed",
    "sort",
    "tail",
    "tr",
    "uniq",
    "wc",
}
PACKAGE_RUNNERS = {"bun", "bunx", "convex", "npm", "npx", "pnpm", "yarn"}
COMMAND_PREFIXES = {"command", "env", "exec", "sudo", "time"}
PRODUCTION_SCRIPTS = {
    "analytics:dev:production",
    "analytics:start:production",
    "dev:production",
    "start:production",
}
SEPARATORS = {"&&", "||", ";", "|", "&", "(", ")", "\n"}
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
PROD_ASSIGNMENT = re.compile(r"^CONVEX_(DEPLOYMENT|DEPLOY_KEY)=[\"']?prod:")


def split_segments(command: str) -> list[list[str]]:
    """コマンドを`&&`やパイプで区切り、区切りごとの単語列を返す。"""
    # 引用符の外の改行はコマンドの区切りとして扱う。引用符の中では`;`も単語の一部に残る。
    command = command.replace("\n", " ; ")
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        # 引用符が閉じていないなど、解釈できない入力は空白と区切り記号で分ける。
        tokens = re.split(r"\s+|(&&|\|\||[;|()])", command)
        tokens = [token for token in tokens if token]

    segments: list[list[str]] = [[]]
    for token in tokens:
        if token in SEPARATORS or set(token) <= set("&|;()"):
            segments.append([])
        else:
            segments[-1].append(token)
    return [segment for segment in segments if segment]


def command_name(segment: list[str]) -> str:
    """環境変数の代入と`env`などの前置きを飛ばし、実行するコマンド名を返す。"""
    for token in segment:
        if ASSIGNMENT.match(token) or token in COMMAND_PREFIXES:
            continue
        return token.lstrip("$(`").rsplit("/", 1)[-1]
    return ""


def violation(segment: list[str]) -> str | None:
    name = command_name(segment)

    if any(PROD_ASSIGNMENT.match(token) for token in segment):
        return "本番を指すCONVEX_DEPLOYMENTまたはCONVEX_DEPLOY_KEYを指定しています"

    if name not in READ_ONLY_COMMANDS and any(PROD_DEPLOYMENT in token for token in segment):
        return f"本番のdeployment（{PROD_DEPLOYMENT}）を指定しています"

    if name in PACKAGE_RUNNERS:
        if any(token in PRODUCTION_SCRIPTS for token in segment):
            return "本番modeで起動するscriptです"

        convex_at = next(
            (i for i, token in enumerate(segment) if token == "convex" or token.endswith("/convex")),
            None,
        )
        if convex_at is not None:
            rest = segment[convex_at + 1 :]
            if any(token == "--prod" or token.startswith("--prod=") for token in rest):
                return "`convex`へ`--prod`を指定しています"
            if rest[:1] == ["deploy"]:
                return "`convex deploy`は本番へ反映するコマンドです"

    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    command = (payload.get("tool_input") or {}).get("command") or ""
    if not isinstance(command, str):
        return 0

    for segment in split_segments(command):
        reason = violation(segment)
        if reason:
            print(
                f"本番Convexへの操作は禁止されています: {reason}。"
                "AGENTS.mdの「各Convex環境への接続」を確認し、必要な場合はユーザーへ依頼してください。",
                file=sys.stderr,
            )
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
