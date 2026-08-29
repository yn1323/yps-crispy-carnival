#!/usr/bin/env tsx

import { execFile as execFileCallback } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

type ExportRow = Record<string, unknown>;

export type ShopLifecycleVerificationInput = {
  shops: ExportRow[];
  organizationAuditEvents: ExportRow[];
  analyticsSourceEvents: ExportRow[];
};

export type ShopLifecycleReadinessReport = {
  ready: boolean;
  phase: "pre_runtime";
  source: "convex_export";
  scannedRows: {
    shops: number;
    organizationAuditEvents: number;
    analyticsSourceEvents: number;
  };
  observations: {
    operatingStatusPresent: number;
    archivedDeletedShops: number;
    archivedNonDeletedShops: number;
    archivedShopsWithUnknownDeletionState: number;
  };
  anomalies: {
    archivedOperatingStatus: number;
    unknownOperatingStatus: number;
    shopArchivedActions: number;
    shopReactivatedActions: number;
    shopArchivedChanges: number;
    shopReactivatedChanges: number;
    shopStatusDeltas: number;
  };
};

const execFile = promisify(execFileCallback);

const isRecord = (value: unknown): value is ExportRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requireString(row: ExportRow, field: string, table: string, lineNumber: number) {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${table}/documents.jsonl:${lineNumber} has an invalid ${field}`);
  }
  return value;
}

/** Export内の識別子やpayloadはreportへ含めず、Narrow判定に必要な全件集計だけを返す。 */
export function verifyShopLifecycleReadiness(input: ShopLifecycleVerificationInput): ShopLifecycleReadinessReport {
  let operatingStatusPresent = 0;
  let archivedOperatingStatus = 0;
  let archivedDeletedShops = 0;
  let archivedNonDeletedShops = 0;
  let archivedShopsWithUnknownDeletionState = 0;
  let unknownOperatingStatus = 0;
  for (const shop of input.shops) {
    const { operatingStatus } = shop;
    if (operatingStatus === undefined) continue;
    operatingStatusPresent += 1;
    if (operatingStatus === "archived") {
      archivedOperatingStatus += 1;
      if (shop.isDeleted === true) archivedDeletedShops += 1;
      else if (shop.isDeleted === false) archivedNonDeletedShops += 1;
      else archivedShopsWithUnknownDeletionState += 1;
    } else if (operatingStatus !== "active") unknownOperatingStatus += 1;
  }

  const shopArchivedActions = input.organizationAuditEvents.filter(
    (event) => event.action === "organization.shop_archived",
  ).length;
  const shopReactivatedActions = input.organizationAuditEvents.filter(
    (event) => event.action === "organization.shop_reactivated",
  ).length;

  let shopArchivedChanges = 0;
  let shopReactivatedChanges = 0;
  let shopStatusDeltas = 0;
  for (const event of input.analyticsSourceEvents) {
    if (!isRecord(event.payload)) continue;
    const payload = event.payload;
    if (payload.kind === "shop" && payload.change === "archived") shopArchivedChanges += 1;
    if (payload.kind === "shop" && payload.change === "reactivated") shopReactivatedChanges += 1;
    if (payload.kind !== "plan" || !Array.isArray(payload.statusDeltas)) continue;
    shopStatusDeltas += payload.statusDeltas.filter((delta) => isRecord(delta) && delta.kind === "shop").length;
  }

  const anomalies = {
    archivedOperatingStatus,
    unknownOperatingStatus,
    shopArchivedActions,
    shopReactivatedActions,
    shopArchivedChanges,
    shopReactivatedChanges,
    shopStatusDeltas,
  };
  return {
    ready: Object.values(anomalies).every((count) => count === 0),
    phase: "pre_runtime",
    source: "convex_export",
    scannedRows: {
      shops: input.shops.length,
      organizationAuditEvents: input.organizationAuditEvents.length,
      analyticsSourceEvents: input.analyticsSourceEvents.length,
    },
    observations: {
      operatingStatusPresent,
      archivedDeletedShops,
      archivedNonDeletedShops,
      archivedShopsWithUnknownDeletionState,
    },
    anomalies,
  };
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

export async function verifyShopLifecycleReadinessExport(exportPath: string) {
  const exportStat = await stat(exportPath);
  const zipEntries = exportStat.isDirectory() ? undefined : await readZipEntries(exportPath);
  const metadata = await readExportTable(exportPath, "_tables", zipEntries);
  const names = new Set(metadata.map((row, index) => requireString(row, "name", "_tables", index + 1)));
  const requiredTables = ["shops", "organizationAuditEvents", "analyticsSourceEvents"] as const;
  for (const table of requiredTables) {
    if (!names.has(table)) throw new Error(`${table} is not listed in _tables/documents.jsonl`);
  }
  const [shops, organizationAuditEvents, analyticsSourceEvents] = await Promise.all(
    requiredTables.map(async (table) => await readExportTable(exportPath, table, zipEntries)),
  );
  return verifyShopLifecycleReadiness({ shops, organizationAuditEvents, analyticsSourceEvents });
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
  const report = await verifyShopLifecycleReadinessExport(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready) process.exitCode = 1;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`Shop lifecycle readiness verification failed: ${message}\n`);
    process.exitCode = 1;
  });
}
