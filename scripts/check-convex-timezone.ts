#!/usr/bin/env tsx

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

type Rule = {
  id: string;
  regex: RegExp;
  message: string;
};

export type ConvexTimezoneIssue = {
  filePath: string;
  line: number;
  column: number;
  ruleId: string;
  message: string;
  snippet: string;
};

const DANGEROUS_TIMEZONE_RULES: Rule[] = [
  {
    id: "toISOString-date-slice",
    regex: /\.\s*toISOString\s*\(\s*\)\s*\.\s*slice\s*\(\s*0\s*,\s*10\s*\)/g,
    message: "JSTの業務日付は todayJST など convex/_lib/dateFormat.ts の helper で生成してください。",
  },
  {
    id: "toISOString-date-split",
    regex: /\.\s*toISOString\s*\(\s*\)\s*\.\s*split\s*\(\s*["']T["']\s*\)\s*\[\s*0\s*\]/g,
    message: "JSTの業務日付は todayJST など convex/_lib/dateFormat.ts の helper で生成してください。",
  },
  {
    id: "date-only-constructor",
    regex: /\bnew\s+Date\s*\(\s*["'`]\d{4}-\d{2}-\d{2}["'`]\s*\)/g,
    message: "日付だけの new Date はUTC解釈になりやすいため、dateFormat helper を使ってください。",
  },
  {
    id: "date-utc-direct",
    regex: /\bDate\s*\.\s*UTC\s*\(/g,
    message: "本番Convexコードでは Date.UTC を直接使わず、業務意味のある dateFormat helper に閉じ込めてください。",
  },
];

const EXCLUDED_SEGMENTS = new Set(["_generated", "_scenario", "_test"]);
const EXCLUDED_FILES = new Set(["convex/testing.ts", "convex/_lib/dateFormat.ts"]);

const normalizePath = (filePath: string) => filePath.split(path.sep).join("/");

export const shouldCheckConvexTimezoneFile = (filePath: string) => {
  const normalized = normalizePath(filePath);

  if (!normalized.startsWith("convex/")) return false;
  if (!normalized.endsWith(".ts")) return false;
  if (normalized.endsWith(".test.ts")) return false;
  if (EXCLUDED_FILES.has(normalized)) return false;

  const segments = normalized.split("/");
  return !segments.some((segment) => EXCLUDED_SEGMENTS.has(segment));
};

const getLineColumn = (source: string, index: number) => {
  const before = source.slice(0, index).split("\n");
  return {
    line: before.length,
    column: before[before.length - 1].length + 1,
  };
};

const getSnippet = (source: string, index: number) => {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  const lineEnd = source.indexOf("\n", index);
  return source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim();
};

export const findConvexTimezoneIssuesInSource = (source: string, filePath: string): ConvexTimezoneIssue[] => {
  const issues: ConvexTimezoneIssue[] = [];

  for (const rule of DANGEROUS_TIMEZONE_RULES) {
    rule.regex.lastIndex = 0;
    for (const match of source.matchAll(rule.regex)) {
      const index = match.index ?? 0;
      const { line, column } = getLineColumn(source, index);
      issues.push({
        filePath,
        line,
        column,
        ruleId: rule.id,
        message: rule.message,
        snippet: getSnippet(source, index),
      });
    }
  }

  return issues.sort((a, b) => a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
};

const collectFiles = async (rootDir: string, dir: string): Promise<string[]> => {
  const entries = await readdir(path.join(rootDir, dir), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = normalizePath(path.join(dir, entry.name));

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(rootDir, relativePath)));
      continue;
    }

    if (entry.isFile() && shouldCheckConvexTimezoneFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
};

export const collectConvexTimezoneIssues = async (rootDir = process.cwd()) => {
  const files = await collectFiles(rootDir, "convex");
  const issues: ConvexTimezoneIssue[] = [];

  for (const filePath of files) {
    const source = await readFile(path.join(rootDir, filePath), "utf8");
    issues.push(...findConvexTimezoneIssuesInSource(source, filePath));
  }

  return issues.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line || a.column - b.column);
};

const formatIssue = (issue: ConvexTimezoneIssue) =>
  `${issue.filePath}:${issue.line}:${issue.column} ${issue.ruleId}\n  ${issue.message}\n  ${issue.snippet}`;

const main = async () => {
  const issues = await collectConvexTimezoneIssues();

  if (issues.length === 0) {
    console.log("Convex timezone check passed.");
    return;
  }

  console.error(`Convex timezone check found ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(formatIssue(issue));
  }
  process.exit(1);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
