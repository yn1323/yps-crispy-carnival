#!/usr/bin/env python3
"""日本語でない返答のままターンを終えないようにするStopフック。

AGENTS.mdの「必ず日本語で返答すること」は文章の指示で、長い作業のあとに英語の返答が出たことがある。
最後の返答に日本語がほとんどなければ、exit code 2で終了を差し戻す。stderrの内容がClaudeへ理由として渡る。
"""

import json
import re
import sys

# 英字がこの数に満たない返答は検査しない。コマンド名やファイル名だけの短い返答を差し戻さないため。
MIN_ASCII_LETTERS = 80
# 日本語の文字数が英字の数のこの割合に満たなければ、日本語の返答ではないとみなす。
MIN_JAPANESE_RATIO = 0.05


def strip_non_prose(text: str) -> str:
    """コード、URL、リンク先は日本語でなくてよいので、検査の対象から除く。"""
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`[^`\n]*`", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    return re.sub(r"https?://\S+", " ", text)


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    # 一度差し戻した後は止めない。英語の引用が多い返答で、ターンを終えられなくなるのを防ぐ。
    if data.get("stop_hook_active"):
        return 0

    message = data.get("last_assistant_message")
    if not isinstance(message, str):
        return 0

    prose = strip_non_prose(message)
    ascii_letters = len(re.findall(r"[A-Za-z]", prose))
    japanese = len(re.findall(r"[぀-ヿ一-鿿]", prose))
    if ascii_letters < MIN_ASCII_LETTERS or japanese >= ascii_letters * MIN_JAPANESE_RATIO:
        return 0

    print(
        "最後の返答が日本語ではありません。AGENTS.mdの「必ず日本語で返答すること」に従い、同じ内容を日本語で書き直してください。",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
