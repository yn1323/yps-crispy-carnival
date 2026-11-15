#!/usr/bin/env python3
"""本番Convexへ到達するBashコマンドを止めるPreToolUseフック。

AGENTS.mdの「各Convex環境への接続」は、本番環境の閲覧と編集を禁止している。
文章の指示だけではモデルの判断に依存するため、ここで機械的に止める。

止める対象:
- 本番のdeployment名を含むコマンド（検索や表示だけのコマンドは除く）
- `convex ... --prod`、`convex ... --deployment prod`、`convex deploy`
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
    """Convex CLIの呼び出しかを返す。`convex:run:local`のように引数をCLIへ渡すpackage scriptも含める。"""
    token = token.strip("`")
    return token == "convex" or token.endswith("/convex") or token.startswith(("convex@", "convex:"))


def production_flag(arguments: list[str]) -> str | None:
    """Convex CLIの引数から、本番を指す指定を返す。"""
    for index, token in enumerate(arguments):
        if token == "--prod" or token.startswith("--prod="):
            return "--prod"
        if token == "--deployment":
            reference = arguments[index + 1] if index + 1 < len(arguments) else ""
        elif token.startswith("--deployment="):
            reference = token.split("=", 1)[1]
        else:
            continue
        # `prod`はprojectの既定の本番を指す。`project:prod`と`team:project:prod`も同じ。
        if reference == "prod" or reference.endswith(":prod"):
            return f"--deployment {reference}"
    return None


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
        flag = production_flag(rest)
        if flag:
            return f"`convex`へ`{flag}`を指定しています"
        if "deploy" in rest:
            return "`convex deploy`は本番へ反映するコマンドです"

    return None


def command_substitutions(command: str) -> list[str]:
    """`$(...)`とバッククォートの中身を返す。

    引用符の種類は区別しない。単一引用符の中は実際には展開されないが、
    heredocでは引用符に関係なく展開されるため、判別できない入力は検査する側へ倒す。
    """
    found: list[str] = []
    index = 0
    while index < len(command):
        if command.startswith("$(", index):
            depth = 1
            end = index + 2
            while end < len(command) and depth:
                depth += {"(": 1, ")": -1}.get(command[end], 0)
                end += 1
            found.append(command[index + 2 : end - 1 if depth == 0 else end])
            index = end
        elif command[index] == "`":
            end = command.find("`", index + 1)
            end = len(command) if end == -1 else end
            found.append(command[index + 1 : end])
            index = end + 1
        else:
            index += 1
    return found


def all_segments(command: str, depth: int = 0) -> list[list[str]]:
    """区切りごとの単語列を返す。シェルが別に実行する文字列は、中身も区切って加える。

    対象は、コマンド置換の中身と、`bash -c`と`eval`が受け取る文字列である。
    外側が`echo`などの表示用コマンドでも、これらは先に実行される。
    """
    segments = split_segments(command)
    if depth >= 5:
        return segments

    scripts = command_substitutions(command)
    for segment in segments:
        name = command_name(segment)
        if name in SHELLS and "-c" in segment:
            scripts.extend(segment[segment.index("-c") + 1 :][:1])
        elif name == "eval":
            scripts.append(" ".join(segment[segment.index("eval") + 1 :]))

    nested: list[list[str]] = []
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
