#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type ClearConvexTablesResult = {
  cleared: string[];
  deleted: number;
  nextTable: string | null;
  done: boolean;
};

type ClearConvexTablesOptions = {
  envFile?: string;
};

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const CLEAR_TABLE_BATCH_SIZE = 1000;

function isClearConvexTablesResult(value: unknown): value is ClearConvexTablesResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  return (
    Array.isArray(result.cleared) &&
    result.cleared.every((tableName) => typeof tableName === "string") &&
    typeof result.deleted === "number" &&
    (typeof result.nextTable === "string" || result.nextTable === null) &&
    typeof result.done === "boolean"
  );
}

function parseClearResult(stdout: string): ClearConvexTablesResult {
  const trimmed = stdout.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isClearConvexTablesResult(parsed)) return parsed;
  } catch {
    // pnpm/Convex may print progress lines before the JSON result.
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (isClearConvexTablesResult(parsed)) return parsed;
    } catch {
      // pnpm/Convex may print progress lines before the JSON result.
    }
  }

  throw new Error(`Convex clear result could not be parsed: ${trimmed}`);
}

function runClearBatch(envFile: string | undefined, tableName: string | undefined) {
  const convexArgs = ["exec", "convex", "run"];
  if (envFile) convexArgs.push("--env-file", envFile);
  convexArgs.push("testing:clearAllTables", JSON.stringify(tableName ? { tableName } : {}));

  const stdout = execFileSync(pnpmCommand, convexArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return parseClearResult(stdout);
}

export function clearConvexTables(options: ClearConvexTablesOptions = {}) {
  let nextTable: string | undefined;
  let totalDeleted = 0;
  let batchNumber = 0;
  const clearedTables = new Set<string>();

  console.log("🧹 Convexの全テーブルクリアを開始します...");

  for (;;) {
    batchNumber += 1;
    console.log(
      `[clear] バッチ${batchNumber}を実行中（対象: ${nextTable ?? "先頭テーブル"}、最大${CLEAR_TABLE_BATCH_SIZE}件）`,
    );
    const result = runClearBatch(options.envFile, nextTable);
    totalDeleted += result.deleted;
    result.cleared.forEach((tableName) => {
      clearedTables.add(tableName);
    });
    console.log(
      `[clear] バッチ${batchNumber}完了: ${result.deleted}件削除、累計${totalDeleted}件${
        result.done ? "" : `、次の対象: ${result.nextTable ?? "不明"}`
      }`,
    );
    if (result.done) break;
    if (!result.nextTable) throw new Error("Convex clear returned no next table before completion");
    nextTable = result.nextTable;
  }

  console.log(`✅ 全テーブルのクリアが完了しました（${totalDeleted}件）`);
  return { clearedTables: [...clearedTables], totalDeleted };
}

function parseEnvFile(args: string[]) {
  const envFileIndex = args.indexOf("--env-file");
  if (envFileIndex === -1) return undefined;
  const envFile = args[envFileIndex + 1];
  if (!envFile || args.length !== 2) throw new Error("Usage: clearConvexTables.ts [--env-file <path>]");
  return envFile;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  clearConvexTables({ envFile: parseEnvFile(process.argv.slice(2)) });
}
