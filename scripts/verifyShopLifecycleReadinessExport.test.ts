import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ShopLifecycleVerificationInput,
  verifyShopLifecycleReadiness,
  verifyShopLifecycleReadinessExport,
} from "./verifyShopLifecycleReadinessExport";

const execFile = promisify(execFileCallback);
const temporaryDirectories: string[] = [];

function canonicalFixture(): ShopLifecycleVerificationInput {
  return {
    shops: [{ _id: "secret-shop-id", operatingStatus: "active", isDeleted: false }],
    organizationAuditEvents: [{ _id: "secret-audit-id", action: "organization.shop_deleted" }],
    analyticsSourceEvents: [
      {
        _id: "secret-analytics-id",
        payload: { kind: "shop", change: "deleted", privateValue: "secret-payload" },
      },
    ],
  };
}

async function createExportZip(args?: { listedTables?: string[]; tableSources?: Partial<Record<string, string>> }) {
  const root = await mkdtemp(path.join(tmpdir(), "shop-lifecycle-readiness-"));
  temporaryDirectories.push(root);
  const exportDirectory = path.join(root, "export");
  const tableSources = args?.tableSources ?? {
    shops: `${JSON.stringify({ operatingStatus: "active" })}\n`,
    organizationAuditEvents: "",
    analyticsSourceEvents: "",
  };
  const listedTables = args?.listedTables ?? Object.keys(tableSources);
  const sources = {
    _tables: `${listedTables.map((name) => JSON.stringify({ name })).join("\n")}\n`,
    ...tableSources,
  };
  for (const [table, source] of Object.entries(sources)) {
    const tableDirectory = path.join(exportDirectory, table);
    await mkdir(tableDirectory, { recursive: true });
    await writeFile(path.join(tableDirectory, "documents.jsonl"), source, "utf8");
  }
  const zipPath = path.join(root, "export.zip");
  await execFile("/usr/bin/zip", ["-q", "-r", zipPath, "."], { cwd: exportDirectory });
  return zipPath;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(async (directory) => await rm(directory, { recursive: true })));
});

describe("verifyShopLifecycleReadiness", () => {
  it("activeのoperatingStatusだけが残るm048前exportはreadyを妨げない", () => {
    const report = verifyShopLifecycleReadiness(canonicalFixture());

    expect(report).toEqual({
      ready: true,
      phase: "pre_runtime",
      source: "convex_export",
      scannedRows: { shops: 1, organizationAuditEvents: 1, analyticsSourceEvents: 1 },
      observations: {
        operatingStatusPresent: 1,
        archivedDeletedShops: 0,
        archivedNonDeletedShops: 0,
        archivedShopsWithUnknownDeletionState: 0,
      },
      anomalies: {
        archivedOperatingStatus: 0,
        unknownOperatingStatus: 0,
        shopArchivedActions: 0,
        shopReactivatedActions: 0,
        shopArchivedChanges: 0,
        shopReactivatedChanges: 0,
        shopStatusDeltas: 0,
      },
    });
    expect(JSON.stringify(report)).not.toContain("secret-");
  });

  it("旧店舗status・監査action・analytics payloadを種類別の全件数で停止する", () => {
    const input = canonicalFixture();
    input.shops.push(
      { operatingStatus: "archived", isDeleted: true },
      { operatingStatus: "archived", isDeleted: false },
      { operatingStatus: "archived" },
      { operatingStatus: "paused" },
      { operatingStatus: null },
      {},
    );
    input.organizationAuditEvents.push(
      { action: "organization.shop_archived" },
      { action: "organization.shop_reactivated" },
      { action: "shop_archived" },
    );
    input.analyticsSourceEvents.push(
      { payload: { kind: "shop", change: "archived" } },
      { payload: { kind: "shop", change: "reactivated" } },
      {
        payload: {
          kind: "plan",
          statusDeltas: [
            { kind: "shop", status: "archived" },
            { kind: "staff", status: "deleted" },
            { kind: "shop", status: "active" },
            { kind: "shop", status: "unknown" },
          ],
        },
      },
    );

    const report = verifyShopLifecycleReadiness(input);

    expect(report).toMatchObject({
      ready: false,
      scannedRows: { shops: 7, organizationAuditEvents: 4, analyticsSourceEvents: 4 },
      observations: {
        operatingStatusPresent: 6,
        archivedDeletedShops: 1,
        archivedNonDeletedShops: 1,
        archivedShopsWithUnknownDeletionState: 1,
      },
      anomalies: {
        archivedOperatingStatus: 3,
        unknownOperatingStatus: 2,
        shopArchivedActions: 1,
        shopReactivatedActions: 1,
        shopArchivedChanges: 1,
        shopReactivatedChanges: 1,
        shopStatusDeltas: 3,
      },
    });
  });
});

describe("verifyShopLifecycleReadinessExport", () => {
  it("Convex export ZIPの必須3tableを全件集計する", async () => {
    const zipPath = await createExportZip({
      tableSources: {
        shops: `${JSON.stringify({ operatingStatus: "active" })}\n${JSON.stringify({})}\n`,
        organizationAuditEvents: `${JSON.stringify({ action: "organization.shop_deleted" })}\n`,
        analyticsSourceEvents: `${JSON.stringify({ payload: { kind: "shop", change: "deleted" } })}\n`,
      },
    });

    await expect(verifyShopLifecycleReadinessExport(zipPath)).resolves.toMatchObject({
      ready: true,
      scannedRows: { shops: 2, organizationAuditEvents: 1, analyticsSourceEvents: 1 },
      observations: {
        operatingStatusPresent: 1,
        archivedDeletedShops: 0,
        archivedNonDeletedShops: 0,
        archivedShopsWithUnknownDeletionState: 0,
      },
    });
  });

  it("必須tableがmetadataにないexportをfail closedする", async () => {
    const zipPath = await createExportZip({
      listedTables: ["shops", "organizationAuditEvents"],
      tableSources: { shops: "", organizationAuditEvents: "" },
    });

    await expect(verifyShopLifecycleReadinessExport(zipPath)).rejects.toThrow(
      "analyticsSourceEvents is not listed in _tables/documents.jsonl",
    );
  });

  it("不正JSONをfail closedする", async () => {
    const zipPath = await createExportZip({
      tableSources: {
        shops: "{not-json}\n",
        organizationAuditEvents: "",
        analyticsSourceEvents: "",
      },
    });

    await expect(verifyShopLifecycleReadinessExport(zipPath)).rejects.toThrow(
      "shops/documents.jsonl:1 is not valid JSON",
    );
  });

  it("不正ZIPをfail closedする", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "shop-lifecycle-readiness-invalid-"));
    temporaryDirectories.push(root);
    const zipPath = path.join(root, "invalid.zip");
    await writeFile(zipPath, "not a zip", "utf8");

    await expect(verifyShopLifecycleReadinessExport(zipPath)).rejects.toThrow();
  });

  it("CLIがreadiness reportだけをJSONで出力する", async () => {
    const zipPath = await createExportZip();
    const scriptPath = path.resolve("scripts/verifyShopLifecycleReadinessExport.ts");

    const { stdout } = await execFile(process.execPath, ["--import", "tsx", scriptPath, "--path", zipPath], {
      encoding: "utf8",
    });

    expect(JSON.parse(stdout)).toMatchObject({
      ready: true,
      phase: "pre_runtime",
      source: "convex_export",
      observations: {
        operatingStatusPresent: 1,
        archivedDeletedShops: 0,
        archivedNonDeletedShops: 0,
        archivedShopsWithUnknownDeletionState: 0,
      },
    });
  });

  it("CLIがblocking anomalyを終了コード1で停止する", async () => {
    const zipPath = await createExportZip({
      tableSources: {
        shops: `${JSON.stringify({ operatingStatus: "archived" })}\n`,
        organizationAuditEvents: "",
        analyticsSourceEvents: "",
      },
    });
    const scriptPath = path.resolve("scripts/verifyShopLifecycleReadinessExport.ts");

    await expect(
      execFile(process.execPath, ["--import", "tsx", scriptPath, "--path", zipPath], { encoding: "utf8" }),
    ).rejects.toMatchObject({ code: 1 });
  });
});
