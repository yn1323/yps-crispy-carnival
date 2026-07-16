import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  type ComplimentaryBusinessVerificationInput,
  parseComplimentaryBusinessVerificationArgs,
  parseJsonLines,
  readComplimentaryBusinessExport,
  verifyComplimentaryBusinessExport,
} from "./verifyComplimentaryBusinessExport";

const execFile = promisify(execFileCallback);

const emptyInput = (): ComplimentaryBusinessVerificationInput => ({
  organizations: [],
  shops: [],
  billingStates: [],
  auditEvents: [],
  migrationConflicts: [],
});

const complimentaryState = (id: string, organizationId: string, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  organizationId,
  state: { kind: "complimentary", plan: "business" },
  version: 1,
  ...overrides,
});

const migrationAudit = (id: string, organizationId: string, targetId: string) => ({
  _id: id,
  organizationId,
  action: "organization.billing_state_changed",
  targetKind: "billing",
  targetId,
  toState: "complimentary.business",
  correlationId: `${organizationId}:migration:m012:complimentary-business`,
});

const targetSnapshot = (input: ComplimentaryBusinessVerificationInput) => {
  const targetIds = input.organizations
    .filter((organization) => typeof organization.migrationSourceShopId === "string")
    .map((organization) => String(organization._id))
    .sort();
  return {
    targetCount: targetIds.length,
    targetSetSha256: createHash("sha256").update(targetIds.join("\n")).digest("hex"),
  };
};

describe("verifyComplimentaryBusinessExport", () => {
  it("preでは相互リンクが一意で課金状態がない移行対象だけを実行可能と判定する", () => {
    const input = emptyInput();
    input.organizations = [
      { _id: "organization-migrated", migrationSourceShopId: "shop-migrated" },
      { _id: "organization-new" },
    ];
    input.shops = [{ _id: "shop-migrated", organizationId: "organization-migrated" }];

    expect(verifyComplimentaryBusinessExport(input, "pre")).toEqual({
      mode: "pre",
      ok: true,
      migrationStatus: "not_verified_by_export",
      targetSetSha256: "a650bb0d5bf9c867561596a34d7c6a4faf5013af82edfe9f86c8768e02b277d6",
      counts: {
        organizations: 2,
        targetOrganizations: 1,
        migrationReadyTargets: 1,
        compliantTargets: 0,
        complimentaryStates: 0,
        nonTargetComplimentaryStates: 0,
        orphanComplimentaryStates: 0,
        m012MigrationAudits: 0,
        nonTargetMigrationAudits: 0,
        orphanMigrationAudits: 0,
        unresolvedMigrationConflicts: 0,
        unresolvedM012Conflicts: 0,
        duplicateM012ConflictKeys: 0,
      },
      issues: [],
    });
  });

  it("対象0件のexportをGo判定にしない", () => {
    const report = verifyComplimentaryBusinessExport(emptyInput(), "pre");

    expect(report.ok).toBe(false);
    expect(report.counts.targetOrganizations).toBe(0);
    expect(report.issues).toEqual([{ code: "no_target_organizations", count: 0 }]);
  });

  it("preでは既存課金、重複、リンク不整合、対象外付与、未解消conflictを完全に列挙する", () => {
    const input = emptyInput();
    input.organizations = [
      { _id: "organization-missing", migrationSourceShopId: "shop-missing" },
      { _id: "organization-mismatch", migrationSourceShopId: "shop-mismatch" },
      { _id: "organization-duplicate-a", migrationSourceShopId: "shop-duplicate" },
      { _id: "organization-duplicate-b", migrationSourceShopId: "shop-duplicate" },
      { _id: "organization-existing", migrationSourceShopId: "shop-existing" },
      { _id: "organization-duplicate-billing", migrationSourceShopId: "shop-duplicate-billing" },
      { _id: "organization-new" },
    ];
    input.shops = [
      { _id: "shop-mismatch", organizationId: "another-organization" },
      { _id: "shop-duplicate", organizationId: "organization-duplicate-a" },
      { _id: "shop-existing", organizationId: "organization-existing" },
      { _id: "shop-duplicate-billing", organizationId: "organization-duplicate-billing" },
    ];
    input.billingStates = [
      { _id: "billing-existing", organizationId: "organization-existing", state: { kind: "active", plan: "business" } },
      { _id: "billing-duplicate-a", organizationId: "organization-duplicate-billing", state: { kind: "trial" } },
      {
        _id: "billing-duplicate-b",
        organizationId: "organization-duplicate-billing",
        state: { kind: "active", plan: "free" },
      },
      complimentaryState("billing-new", "organization-new"),
      complimentaryState("billing-orphan", "organization-orphan"),
    ];
    input.auditEvents = [migrationAudit("audit-existing", "organization-existing", "billing-existing")];
    input.migrationConflicts = [
      {
        _id: "conflict",
        organizationId: "organization-missing",
        sourceType: "shop",
        sourceId: "shop-missing",
        code: "complimentary_business_missing_source_shop",
      },
    ];

    const report = verifyComplimentaryBusinessExport(input, "pre");

    expect(report.ok).toBe(false);
    expect(report.counts).toEqual({
      organizations: 7,
      targetOrganizations: 6,
      migrationReadyTargets: 0,
      compliantTargets: 0,
      complimentaryStates: 2,
      nonTargetComplimentaryStates: 1,
      orphanComplimentaryStates: 1,
      m012MigrationAudits: 1,
      nonTargetMigrationAudits: 0,
      orphanMigrationAudits: 0,
      unresolvedMigrationConflicts: 1,
      unresolvedM012Conflicts: 1,
      duplicateM012ConflictKeys: 0,
    });
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "duplicate_billing_states",
      "duplicate_migration_source_shop_id",
      "duplicate_migration_source_shop_id",
      "existing_billing_state",
      "existing_m012_migration_conflict",
      "existing_migration_audit",
      "missing_source_shop",
      "non_target_complimentary_business",
      "orphan_complimentary_business",
      "source_shop_organization_mismatch",
      "source_shop_organization_mismatch",
      "unresolved_migration_conflict",
    ]);
  });

  it("postでは全移行対象の一対一対応、監査一件、conflict解消を完了条件にする", () => {
    const input = emptyInput();
    input.organizations = [
      { _id: "organization-a", migrationSourceShopId: "shop-a" },
      { _id: "organization-b", migrationSourceShopId: "shop-b", isDeleted: true },
      { _id: "organization-new" },
    ];
    input.shops = [
      { _id: "shop-a", organizationId: "organization-a" },
      { _id: "shop-b", organizationId: "organization-b" },
    ];
    input.billingStates = [
      complimentaryState("billing-a", "organization-a"),
      complimentaryState("billing-b", "organization-b"),
      { _id: "billing-new", organizationId: "organization-new", state: { kind: "trial", trialEndsAt: 1 } },
    ];
    input.auditEvents = [
      migrationAudit("audit-a", "organization-a", "billing-a"),
      migrationAudit("audit-b", "organization-b", "billing-b"),
    ];
    input.migrationConflicts = [
      {
        _id: "resolved-conflict",
        organizationId: "organization-a",
        sourceType: "shop",
        sourceId: "shop-a",
        code: "complimentary_business_existing_billing_state",
        resolvedAt: 100,
      },
    ];

    expect(verifyComplimentaryBusinessExport(input, "post", targetSnapshot(input))).toEqual({
      mode: "post",
      ok: true,
      migrationStatus: "not_verified_by_export",
      targetSetSha256: "0a3f44f71c4235df1bcf0c6bafaf68a2cb48f276ba96b64add0505b940dfc21c",
      counts: {
        organizations: 3,
        targetOrganizations: 2,
        migrationReadyTargets: 0,
        compliantTargets: 2,
        complimentaryStates: 2,
        nonTargetComplimentaryStates: 0,
        orphanComplimentaryStates: 0,
        m012MigrationAudits: 2,
        nonTargetMigrationAudits: 0,
        orphanMigrationAudits: 0,
        unresolvedMigrationConflicts: 0,
        unresolvedM012Conflicts: 0,
        duplicateM012ConflictKeys: 0,
      },
      issues: [],
    });
  });

  it("postではpre snapshotと対象件数または対象集合が違えば失敗する", () => {
    const input = emptyInput();
    input.organizations = [{ _id: "organization-a", migrationSourceShopId: "shop-a" }];
    input.shops = [{ _id: "shop-a", organizationId: "organization-a" }];
    input.billingStates = [complimentaryState("billing-a", "organization-a")];
    input.auditEvents = [migrationAudit("audit-a", "organization-a", "billing-a")];

    const report = verifyComplimentaryBusinessExport(input, "post", {
      targetCount: 2,
      targetSetSha256: "0".repeat(64),
    });

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(["unexpected_target_count", "unexpected_target_set"]);
  });

  it("postでは不足・別状態・重複監査・対象外付与・未解消conflictを成功扱いにしない", () => {
    const input = emptyInput();
    input.organizations = [
      { _id: "organization-missing", migrationSourceShopId: "shop-missing" },
      { _id: "organization-active", migrationSourceShopId: "shop-active" },
      { _id: "organization-duplicate", migrationSourceShopId: "shop-duplicate" },
      { _id: "organization-new" },
    ];
    input.shops = [
      { _id: "shop-missing", organizationId: "organization-missing" },
      { _id: "shop-active", organizationId: "organization-active" },
      { _id: "shop-duplicate", organizationId: "organization-duplicate" },
    ];
    input.billingStates = [
      { _id: "billing-active", organizationId: "organization-active", state: { kind: "active", plan: "business" } },
      complimentaryState("billing-duplicate-a", "organization-duplicate"),
      complimentaryState("billing-duplicate-b", "organization-duplicate"),
      complimentaryState("billing-new", "organization-new"),
    ];
    input.auditEvents = [
      migrationAudit("audit-active", "organization-active", "billing-active"),
      migrationAudit("audit-duplicate-a", "organization-duplicate", "billing-duplicate-a"),
      migrationAudit("audit-duplicate-b", "organization-duplicate", "billing-duplicate-b"),
    ];
    input.migrationConflicts = [
      {
        _id: "unresolved-conflict",
        organizationId: "organization-active",
        sourceType: "shop",
        sourceId: "shop-active",
        code: "complimentary_business_existing_billing_state",
      },
      {
        _id: "resolved-duplicate-conflict",
        organizationId: "organization-active",
        sourceType: "shop",
        sourceId: "shop-active",
        code: "complimentary_business_existing_billing_state",
        resolvedAt: 100,
      },
    ];

    const report = verifyComplimentaryBusinessExport(input, "post", targetSnapshot(input));

    expect(report.ok).toBe(false);
    expect(report.counts.compliantTargets).toBe(0);
    expect(report.counts.duplicateM012ConflictKeys).toBe(1);
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "duplicate_billing_states",
      "duplicate_m012_migration_conflicts",
      "duplicate_migration_audits",
      "invalid_migration_audit",
      "missing_complimentary_business",
      "missing_migration_audit",
      "non_target_complimentary_business",
      "unexpected_billing_state",
      "unresolved_migration_conflict",
    ]);
  });

  it("postでは課金状態のshape、監査target、対象外と孤児のm012監査を厳密に検証する", () => {
    const input = emptyInput();
    input.organizations = [
      { _id: "organization-wrong-target", migrationSourceShopId: "shop-wrong-target" },
      { _id: "organization-invalid-shape", migrationSourceShopId: "shop-invalid-shape" },
      { _id: "organization-duplicate-audit", migrationSourceShopId: "shop-duplicate-audit" },
      { _id: "organization-new" },
    ];
    input.shops = [
      { _id: "shop-wrong-target", organizationId: "organization-wrong-target" },
      { _id: "shop-invalid-shape", organizationId: "organization-invalid-shape" },
      { _id: "shop-duplicate-audit", organizationId: "organization-duplicate-audit" },
    ];
    input.billingStates = [
      complimentaryState("billing-wrong-target", "organization-wrong-target"),
      complimentaryState("billing-invalid-shape", "organization-invalid-shape", {
        version: 2,
        freeShopId: "shop-invalid-shape",
      }),
      complimentaryState("billing-duplicate-audit", "organization-duplicate-audit"),
    ];
    input.auditEvents = [
      migrationAudit("audit-wrong-target", "organization-wrong-target", "another-billing-state"),
      migrationAudit("audit-invalid-shape", "organization-invalid-shape", "billing-invalid-shape"),
      migrationAudit("audit-duplicate", "organization-duplicate-audit", "billing-duplicate-audit"),
      {
        ...migrationAudit("audit-wrong-correlation", "organization-duplicate-audit", "billing-duplicate-audit"),
        correlationId: "wrong-correlation",
      },
      migrationAudit("audit-new", "organization-new", "billing-new"),
      migrationAudit("audit-orphan", "organization-orphan", "billing-orphan"),
    ];

    const report = verifyComplimentaryBusinessExport(input, "post", targetSnapshot(input));

    expect(report.ok).toBe(false);
    expect(report.counts).toMatchObject({
      compliantTargets: 0,
      m012MigrationAudits: 6,
      nonTargetMigrationAudits: 1,
      orphanMigrationAudits: 1,
    });
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "duplicate_migration_audits",
      "invalid_migration_audit",
      "invalid_migration_audit",
      "non_target_migration_audit",
      "orphan_migration_audit",
      "unexpected_billing_state",
    ]);
  });
});

describe("parseJsonLines", () => {
  it("空行を除外して一行一objectを読み込む", () => {
    expect(parseJsonLines('{"_id":"a"}\n\n{"_id":"b"}\n', "organizations")).toEqual([{ _id: "a" }, { _id: "b" }]);
  });

  it("壊れたJSONやobject以外をfail-closedにする", () => {
    expect(() => parseJsonLines("not-json", "organizations")).toThrow(
      "organizations/documents.jsonl:1 is not valid JSON",
    );
    expect(() => parseJsonLines("[]", "organizations")).toThrow(
      "organizations/documents.jsonl:1 must contain an object",
    );
  });
});

describe("parseComplimentaryBusinessVerificationArgs", () => {
  it("pnpm経由の区切り文字を無視してmodeとZIP pathを読む", () => {
    expect(parseComplimentaryBusinessVerificationArgs(["--", "--mode", "pre", "--path", "/safe/export.zip"])).toEqual({
      mode: "pre",
      exportPath: "/safe/export.zip",
      expectedTargetSnapshot: undefined,
    });
  });

  it("postではpre reportの対象件数とhashを必須にする", () => {
    expect(() => parseComplimentaryBusinessVerificationArgs(["--mode", "post", "--path", "/safe/export.zip"])).toThrow(
      "post mode requires --expected-target-count and --expected-target-set-sha256 from the pre report",
    );

    expect(
      parseComplimentaryBusinessVerificationArgs([
        "--mode",
        "post",
        "--path",
        "/safe/export.zip",
        "--expected-target-count",
        "12",
        "--expected-target-set-sha256",
        "A".repeat(64),
      ]),
    ).toEqual({
      mode: "post",
      exportPath: "/safe/export.zip",
      expectedTargetSnapshot: {
        targetCount: 12,
        targetSetSha256: "a".repeat(64),
      },
    });
  });
});

describe("readComplimentaryBusinessExport", () => {
  it("_tablesで列挙された5つの必須tableがないexportをfail-closedにする", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "m012-export-"));
    try {
      await mkdir(path.join(rootDir, "organizations"));
      await mkdir(path.join(rootDir, "_tables"));
      await writeFile(
        path.join(rootDir, "_tables", "documents.jsonl"),
        '{"name":"organizations"}\n{"name":"shops"}\n{"name":"organizationBillingStates"}\n{"name":"organizationAuditEvents"}\n{"name":"organizationMigrationConflicts"}\n',
      );
      await writeFile(path.join(rootDir, "organizations", "documents.jsonl"), '{"_id":"organization-a"}\n');

      await expect(readComplimentaryBusinessExport(rootDir)).rejects.toThrow(/shops.*documents\.jsonl/u);

      await mkdir(path.join(rootDir, "shops"));
      await writeFile(path.join(rootDir, "shops", "documents.jsonl"), '{"_id":"shop-a"}\n');
      await expect(readComplimentaryBusinessExport(rootDir)).rejects.toThrow(
        /organizationBillingStates.*documents\.jsonl/u,
      );

      for (const table of ["organizationBillingStates", "organizationAuditEvents", "organizationMigrationConflicts"]) {
        await mkdir(path.join(rootDir, table));
        await writeFile(path.join(rootDir, table, "documents.jsonl"), "");
      }
      await expect(readComplimentaryBusinessExport(rootDir)).resolves.toEqual({
        organizations: [{ _id: "organization-a" }],
        shops: [{ _id: "shop-a" }],
        billingStates: [],
        auditEvents: [],
        migrationConflicts: [],
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("Convex export ZIPを展開せずに読み取る", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "m012-export-zip-"));
    const extractedDir = path.join(rootDir, "export");
    const zipPath = path.join(rootDir, "export.zip");
    try {
      await mkdir(path.join(extractedDir, "organizations"), { recursive: true });
      await mkdir(path.join(extractedDir, "shops"));
      await mkdir(path.join(extractedDir, "_tables"));
      await writeFile(
        path.join(extractedDir, "_tables", "documents.jsonl"),
        '{"name":"organizations"}\n{"name":"shops"}\n{"name":"organizationBillingStates"}\n{"name":"organizationAuditEvents"}\n{"name":"organizationMigrationConflicts"}\n',
      );
      await writeFile(
        path.join(extractedDir, "organizations", "documents.jsonl"),
        '{"_id":"organization-a","migrationSourceShopId":"shop-a"}\n',
      );
      await writeFile(
        path.join(extractedDir, "shops", "documents.jsonl"),
        '{"_id":"shop-a","organizationId":"organization-a"}\n',
      );
      for (const table of ["organizationBillingStates", "organizationAuditEvents", "organizationMigrationConflicts"]) {
        await mkdir(path.join(extractedDir, table));
        await writeFile(path.join(extractedDir, table, "documents.jsonl"), "");
      }
      await execFile("/usr/bin/zip", ["-qr", zipPath, "."], { cwd: extractedDir });

      await expect(readComplimentaryBusinessExport(zipPath)).resolves.toMatchObject({
        organizations: [{ _id: "organization-a", migrationSourceShopId: "shop-a" }],
        shops: [{ _id: "shop-a", organizationId: "organization-a" }],
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
