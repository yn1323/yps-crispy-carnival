#!/usr/bin/env tsx

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { LINE_USER_ACTIVE_ACCOUNT_MAX } from "../convex/constants";

type ExportRow = Record<string, unknown>;

type ReadinessReport = {
  ok: boolean;
  source: "convex_export";
  activeAccountCount: number;
  distinctLineUserCount: number;
  overLimitLineUserCount: number;
  maxActiveAccountsPerLineUser: number;
  activeAssociationSetSha256: string;
  limit: number;
};

const execFile = promisify(execFileCallback);

function isRecord(value: unknown): value is ExportRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(row: ExportRow, field: string, table: string, lineNumber: number) {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${table}/documents.jsonl:${lineNumber} has an invalid ${field}`);
  }
  return value;
}

function requireBoolean(row: ExportRow, field: string, lineNumber: number) {
  const value = row[field];
  if (typeof value !== "boolean") {
    throw new Error(`staffLineAccounts/documents.jsonl:${lineNumber} has an invalid ${field}`);
  }
  return value;
}

function parseJsonLines(source: string, table: string): ExportRow[] {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        throw new Error(`${table}/documents.jsonl:${index + 1} is not valid JSON`);
      }
      if (!isRecord(value)) throw new Error(`${table}/documents.jsonl:${index + 1} must contain an object`);
      return value;
    });
}

async function readZipEntries(zipPath: string) {
  const { stdout } = await execFile("/usr/bin/unzip", ["-Z1", zipPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return new Set(
    String(stdout)
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

async function readExportTable(exportPath: string, table: string, zipEntries?: ReadonlySet<string>) {
  const entry = `${table}/documents.jsonl`;
  if (!zipEntries) return parseJsonLines(await readFile(path.join(exportPath, entry), "utf8"), table);
  if (!zipEntries.has(entry)) throw new Error(`${entry} is missing from the Convex export ZIP`);
  const { stdout } = await execFile("/usr/bin/unzip", ["-p", exportPath, entry], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return parseJsonLines(String(stdout), table);
}

export function verifyAnalyticsLineReadiness(rows: ExportRow[]): ReadinessReport {
  const activeCounts = new Map<string, number>();
  const associations: string[] = [];
  for (const [index, row] of rows.entries()) {
    const lineNumber = index + 1;
    const isDeleted = requireBoolean(row, "isDeleted", lineNumber);
    const lineUserId = requireString(row, "lineUserId", "staffLineAccounts", lineNumber);
    const staffId = requireString(row, "staffId", "staffLineAccounts", lineNumber);
    const shopId = requireString(row, "shopId", "staffLineAccounts", lineNumber);
    if (isDeleted) continue;
    activeCounts.set(lineUserId, (activeCounts.get(lineUserId) ?? 0) + 1);
    associations.push(`${lineUserId}\u0000${staffId}\u0000${shopId}`);
  }

  const counts = [...activeCounts.values()];
  const overLimitLineUserCount = counts.filter((count) => count > LINE_USER_ACTIVE_ACCOUNT_MAX).length;
  return {
    ok: overLimitLineUserCount === 0,
    source: "convex_export",
    activeAccountCount: counts.reduce((total, count) => total + count, 0),
    distinctLineUserCount: counts.length,
    overLimitLineUserCount,
    maxActiveAccountsPerLineUser: counts.length === 0 ? 0 : Math.max(...counts),
    activeAssociationSetSha256: createHash("sha256").update(associations.sort().join("\n")).digest("hex"),
    limit: LINE_USER_ACTIVE_ACCOUNT_MAX,
  };
}

export async function verifyAnalyticsLineReadinessExport(exportPath: string) {
  const exportStat = await stat(exportPath);
  const zipEntries = exportStat.isDirectory() ? undefined : await readZipEntries(exportPath);
  const tableMetadata = await readExportTable(exportPath, "_tables", zipEntries);
  const tableNames = new Set(tableMetadata.map((row, index) => requireString(row, "name", "_tables", index + 1)));
  if (!tableNames.has("staffLineAccounts")) {
    throw new Error("staffLineAccounts is not listed in _tables/documents.jsonl");
  }
  return verifyAnalyticsLineReadiness(await readExportTable(exportPath, "staffLineAccounts", zipEntries));
}

function parseArgs(args: string[]) {
  let exportPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--path") {
      exportPath = args[index + 1];
      if (!exportPath) throw new Error("--path requires a Convex export ZIP or extracted directory");
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!exportPath) throw new Error("--path is required");
  return path.resolve(exportPath);
}

async function main() {
  const report = await verifyAnalyticsLineReadinessExport(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`Analytics LINE readiness verification failed: ${message}\n`);
    process.exitCode = 1;
  });
}
