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
COMMAND_PREFIXES = {"command", "env", "exec", "sudo", "time"}
PRODUCTION_SCRIPTS = {
    "analytics:dev:production",
    "analytics:start:production",
    "dev:production",
    "start:production",
}
# `find -exec`と`awk`の`system()`は別のコマンドを実行できるため、検索と表示の扱いから外す。
FIND_EXEC_FLAGS = {"-exec", "-execdir", "-ok", "-okdir"}
# 文字列で受け取ったコマンドを実行するシェル。`-c`の文字列も同じ規則で検査する。
SHELLS = {"bash", "sh", "zsh"}
SEPARATORS = {"&&", "||", ";", "|", "&", "(", ")", "\n"}
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
PROD_ASSIGNMENT = re.compile(r"^CONVEX_(DEPLOYMENT|DEPLOY_KEY)=[\"']?prod:")


def split_segments(command: str) -> list[list[str]]:
    """コマンドを`&&`やパイプで区切り、区切りごとの単語列を返す。"""
    # 引用符の外の改行はコマンドの区切りとして扱う。引用符の中では`;`も単語の一部に残る。
    # バッククォートのコマンド置換も、中身を別のコマンドとして検査する。
    command = command.replace("\n", " ; ").replace("`", " ; ")
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


def is_read_only(name: str, segment: list[str]) -> bool:
    """本番へ接続しない検索と表示のコマンドかを返す。"""
    if name not in READ_ONLY_COMMANDS:
        return False
    if name == "find" and any(token in FIND_EXEC_FLAGS for token in segment):
        return False
    if name == "awk" and any("system(" in token for token in segment):
        return False
    return True


def is_convex_cli(token: str) -> bool:
    token = token.strip("`")
    return token == "convex" or token.endswith("/convex") or token.startswith("convex@")


def violation(segment: list[str]) -> str | None:
    name = command_name(segment)

    if any(PROD_ASSIGNMENT.match(token) for token in segment):
        return "本番を指すCONVEX_DEPLOYMENTまたはCONVEX_DEPLOY_KEYを指定しています"

    # `timeout`や`nohup`などの前置きがあっても検査できるよう、コマンド名ではなく単語列全体を見る。
    if is_read_only(name, segment):
        return None

    if any(PROD_DEPLOYMENT in token for token in segment):
        return f"本番のdeployment（{PROD_DEPLOYMENT}）を指定しています"

    if any(token in PRODUCTION_SCRIPTS for token in segment):
        return "本番modeで起動するscriptです"

    convex_at = next((i for i, token in enumerate(segment) if is_convex_cli(token)), None)
    if convex_at is not None:
        rest = [token.strip("`") for token in segment[convex_at + 1 :]]
        if any(token == "--prod" or token.startswith("--prod=") for token in rest):
            return "`convex`へ`--prod`を指定しています"
        if "deploy" in rest:
            return "`convex deploy`は本番へ反映するコマンドです"

    return None


def all_segments(command: str, depth: int = 0) -> list[list[str]]:
    """区切りごとの単語列を返す。`bash -c`と`eval`が受け取る文字列は、中身も区切って加える。"""
    segments = split_segments(command)
    if depth >= 3:
        return segments

    nested: list[list[str]] = []
    for segment in segments:
        name = command_name(segment)
        if name in SHELLS and "-c" in segment:
            scripts = segment[segment.index("-c") + 1 :][:1]
        elif name == "eval":
            scripts = [" ".join(segment[segment.index("eval") + 1 :])]
        else:
            continue
        for script in scripts:
            nested.extend(all_segments(script, depth + 1))
    return segments + nested


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    command = (payload.get("tool_input") or {}).get("command") or ""
    if not isinstance(command, str):
        return 0

    for segment in all_segments(command):
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
