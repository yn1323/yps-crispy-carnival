import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HOOK_PATH = path.join(process.cwd(), ".claude/hooks/block-convex-production.py");

// 本番のdeployment名はフックの定数を正とし、テストへ複製しない。
const productionDeployment = /^PROD_DEPLOYMENT = "([^"]+)"$/m.exec(readFileSync(HOOK_PATH, "utf8"))?.[1];
if (!productionDeployment) throw new Error("フックからPROD_DEPLOYMENTを読み取れません");
const productionUrl = `https://${productionDeployment}.convex.cloud/api/query`;

const BLOCKED_EXIT_CODE = 2;

const runHook = (command: string) => {
  const result = spawnSync("python3", [HOOK_PATH], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr };
};

describe("本番Convexへの操作を止めるフック", () => {
  it.each([
    ["convex deploy", "npx convex deploy"],
    ["--prodの指定", "pnpm exec convex env list --prod"],
    ["--deployment prodの指定", "pnpm exec convex env list --deployment prod"],
    ["--deployment=prodの指定", "npx convex run foo:bar --deployment=prod"],
    ["別projectの本番を指す--deployment", "npx convex env list --deployment other-project:prod"],
    ["本番のdeployment名の指定", `npx convex run foo:bar --deployment-name ${productionDeployment}`],
    ["本番URLへの接続", `curl ${productionUrl}`],
    ["本番を指す環境変数", `CONVEX_DEPLOYMENT=prod:${productionDeployment} npx convex run foo:bar`],
    ["本番modeのscript", "pnpm dev:production"],
    ["引数をCLIへ渡すpackage script", "pnpm convex:run:local foo:bar --prod"],
    ["前置きコマンドの後ろ", "timeout 60 npx convex deploy"],
    ["&&でつないだ後ろ", "cd app && nohup pnpm exec convex run foo:bar --prod"],
    ["versionを指定したCLI", "npx convex@latest deploy"],
    ["オプションを挟んだdeploy", "npx convex -v deploy"],
    ["bash -cの文字列", 'bash -c "npx convex deploy"'],
    ["sh -cの文字列", 'sh -c "cd x; ./node_modules/.bin/convex import --prod data.zip"'],
    ["evalの文字列", 'eval "npx convex deploy"'],
    ["表示用コマンドの引数にあるコマンド置換", "echo $(npx convex deploy)"],
    ["引用符の中のコマンド置換", 'echo "$(pnpm exec convex env list --prod)"'],
    ["入れ子のコマンド置換", 'echo "$(echo "$(npx convex env list --deployment prod)")"'],
    ["バッククォートのコマンド置換", "echo `npx convex deploy`"],
    ["引用符の中のバッククォート", 'echo "`npx convex deploy`"'],
    ["find -execで実行するコマンド", `find . -maxdepth 0 -exec curl ${productionUrl} ;`],
    ["awkのsystem()で実行するコマンド", `awk 'BEGIN{system("curl ${productionUrl}")}'`],
  ])("%sを止める", (_name, command) => {
    const result = runHook(command);

    expect(result.status).toBe(BLOCKED_EXIT_CODE);
    expect(result.stderr).toContain("本番Convexへの操作は禁止されています");
  });

  it.each([
    ["ローカルのconvex dev", "npx convex dev --once"],
    ["convexのpackage script", "pnpm convex:run:dev testing:seed"],
    ["ローカルのdeployment名の指定", "npx convex run testing:seed --deployment-name fortunate-mallard-809"],
    ["--deployment devの指定", "npx convex env list --deployment dev"],
    ["--deployment localの指定", "npx convex env list --deployment local"],
    ["環境変数の設定", "npx convex env set FOO bar"],
    ["convexディレクトリへの移動", "cd convex && ls"],
    ["Convexのテスト実行", "pnpm vitest run --project='convex(logic)'"],
    ["本番のdeployment名の検索", `grep -r ${productionDeployment} .claude`],
    ["本番のdeployment名を含むファイル名の検索", `find . -name "*${productionDeployment}*"`],
    ["convex deployという文字列の検索", 'rg -n "convex deploy" doc'],
    ["convex deployと書いたコミットメッセージ", 'git commit -m "chore: convex deploy を止める"'],
    ["convex deployという文字列の表示", "echo npx convex deploy"],
    ["本番に触れないコマンド置換", 'echo "$(git status --short)"'],
    ["本番に触れないbash -c", 'bash -c "pnpm test:convex"'],
    ["Convexと関係しない--prod", "pnpm install --prod"],
    ["検証コマンド", "pnpm lint && pnpm type-check"],
  ])("%sは止めない", (_name, command) => {
    expect(runHook(command)).toEqual({ status: 0, stderr: "" });
  });

  it("JSONとして読めない入力は止めない", () => {
    const result = spawnSync("python3", [HOOK_PATH], { input: "not json", encoding: "utf8" });

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  });
});
