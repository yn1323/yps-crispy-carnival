import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  compareFunctionExecutionReports,
  formatFunctionExecutionComparisonMarkdown,
  formatFunctionExecutionSummaryMarkdown,
  summarizeFunctionExecutionInput,
} from "./report";

type OutputFormat = "json" | "markdown";

const parseFlags = (args: string[]) => {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--") || flags.has(name)) {
      throw new Error("CLI引数の形式が不正です。");
    }
    flags.set(name, value);
  }
  return flags;
};

const requireFlag = (flags: Map<string, string>, name: string) => {
  const value = flags.get(name);
  if (!value) throw new Error("必須のCLI引数が不足しています。");
  return value;
};

const assertAllowedFlags = (flags: Map<string, string>, allowed: Set<string>) => {
  if ([...flags.keys()].some((flag) => !allowed.has(flag))) throw new Error("未対応のCLI引数が含まれています。");
};

const getFormat = (flags: Map<string, string>): OutputFormat => {
  const format = flags.get("--format") ?? "markdown";
  if (format !== "json" && format !== "markdown") throw new Error("formatはjsonまたはmarkdownを指定してください。");
  return format;
};

const readInput = async (input: string) => {
  try {
    if (input === "-") {
      process.stdin.setEncoding("utf8");
      let source = "";
      for await (const chunk of process.stdin) source += String(chunk);
      return source;
    }
    return await readFile(input, "utf8");
  } catch {
    throw new Error("入力ファイルを読み取れませんでした。");
  }
};

const output = (format: OutputFormat, report: unknown, markdown: string) => {
  console.log(format === "json" ? JSON.stringify(report, null, 2) : markdown);
};

const runSummary = async (flags: Map<string, string>) => {
  assertAllowedFlags(flags, new Set(["--input", "--release", "--period-start", "--period-end", "--format"]));
  const source = await readInput(requireFlag(flags, "--input"));
  const report = summarizeFunctionExecutionInput(source, {
    releaseId: requireFlag(flags, "--release"),
    periodStart: requireFlag(flags, "--period-start"),
    periodEnd: requireFlag(flags, "--period-end"),
  });
  output(getFormat(flags), report, formatFunctionExecutionSummaryMarkdown(report));
};

const runComparison = async (flags: Map<string, string>) => {
  assertAllowedFlags(
    flags,
    new Set([
      "--baseline",
      "--baseline-release",
      "--baseline-start",
      "--baseline-end",
      "--current",
      "--current-release",
      "--current-start",
      "--current-end",
      "--format",
    ]),
  );
  const baselinePath = requireFlag(flags, "--baseline");
  const currentPath = requireFlag(flags, "--current");
  if (baselinePath === "-" || currentPath === "-") {
    throw new Error("compareではstdinを使用せず、baselineとcurrentの入力ファイルを指定してください。");
  }
  const [baselineSource, currentSource] = await Promise.all([readInput(baselinePath), readInput(currentPath)]);
  const baseline = summarizeFunctionExecutionInput(baselineSource, {
    releaseId: requireFlag(flags, "--baseline-release"),
    periodStart: requireFlag(flags, "--baseline-start"),
    periodEnd: requireFlag(flags, "--baseline-end"),
  });
  const current = summarizeFunctionExecutionInput(currentSource, {
    releaseId: requireFlag(flags, "--current-release"),
    periodStart: requireFlag(flags, "--current-start"),
    periodEnd: requireFlag(flags, "--current-end"),
  });
  const report = compareFunctionExecutionReports(baseline, current);
  output(getFormat(flags), report, formatFunctionExecutionComparisonMarkdown(report));
};

export async function runConvexUsageCli(args = process.argv.slice(2)) {
  const [command, ...flagArgs] = args;
  const flags = parseFlags(flagArgs);
  if (command === "summary") return runSummary(flags);
  if (command === "compare") return runComparison(flags);
  throw new Error("Usage: summaryまたはcompare commandを指定してください。");
}
