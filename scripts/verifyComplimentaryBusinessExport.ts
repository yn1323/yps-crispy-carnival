#!/usr/bin/env tsx

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

type ExportRow = Record<string, unknown>;
type VerificationMode = "pre" | "post";

export type ComplimentaryBusinessVerificationInput = {
  organizations: ExportRow[];
  shops: ExportRow[];
  billingStates: ExportRow[];
  auditEvents: ExportRow[];
  migrationConflicts: ExportRow[];
};

type VerificationIssueCode =
  | "duplicate_billing_states"
  | "duplicate_m012_migration_conflicts"
  | "duplicate_migration_audits"
  | "duplicate_migration_source_shop_id"
  | "existing_billing_state"
  | "existing_m012_migration_conflict"
  | "existing_migration_audit"
  | "invalid_migration_audit"
  | "missing_expected_target_snapshot"
  | "missing_complimentary_business"
  | "missing_migration_audit"
  | "missing_source_shop"
  | "non_target_complimentary_business"
  | "non_target_migration_audit"
  | "no_target_organizations"
  | "orphan_complimentary_business"
  | "orphan_migration_audit"
  | "source_shop_organization_mismatch"
  | "unexpected_billing_state"
  | "unexpected_target_count"
  | "unexpected_target_set"
  | "unresolved_migration_conflict";

export type ComplimentaryBusinessVerificationIssue = {
  code: VerificationIssueCode;
  organizationId?: string;
  sourceShopId?: string;
  count?: number;
  detail?: string;
};

export type ComplimentaryBusinessVerificationReport = {
  mode: VerificationMode;
  ok: boolean;
  migrationStatus: "not_verified_by_export";
  targetSetSha256: string;
  counts: {
    organizations: number;
    targetOrganizations: number;
    migrationReadyTargets: number;
    compliantTargets: number;
    complimentaryStates: number;
    nonTargetComplimentaryStates: number;
    orphanComplimentaryStates: number;
    m012MigrationAudits: number;
    nonTargetMigrationAudits: number;
    orphanMigrationAudits: number;
    unresolvedMigrationConflicts: number;
    unresolvedM012Conflicts: number;
    duplicateM012ConflictKeys: number;
  };
  issues: ComplimentaryBusinessVerificationIssue[];
};

export type ComplimentaryBusinessTargetSnapshot = {
  targetCount: number;
  targetSetSha256: string;
};

const M012_CONFLICT_PREFIX = "complimentary_business_";
const M012_AUDIT_SUFFIX = ":migration:m012:complimentary-business";
const execFile = promisify(execFileCallback);

const isRecord = (value: unknown): value is ExportRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireString = (row: ExportRow, field: string, table: string) => {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${table}.${field} must be a non-empty string`);
  }
  return value;
};

const optionalString = (row: ExportRow, field: string, table: string) => {
  const value = row[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${table}.${field} must be a non-empty string when present`);
  }
  return value;
};

const optionalNumber = (row: ExportRow, field: string, table: string) => {
  const value = row[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${table}.${field} must be a finite number when present`);
  }
  return value;
};

const groupBy = (rows: ExportRow[], key: (row: ExportRow) => string | undefined) => {
  const grouped = new Map<string, ExportRow[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    const current = grouped.get(value) ?? [];
    current.push(row);
    grouped.set(value, current);
  }
  return grouped;
};

const isComplimentaryBusiness = (billingState: ExportRow) => {
  const state = billingState.state;
  return isRecord(state) && state.kind === "complimentary" && state.plan === "business";
};

const isCanonicalComplimentaryBusiness = (billingState: ExportRow) => {
  if (!isComplimentaryBusiness(billingState)) return false;
  const state = billingState.state;
  if (!isRecord(state) || Object.keys(state).sort().join(":") !== "kind:plan") return false;
  return (
    billingState.version === 1 &&
    billingState.freeManagerPersonId === undefined &&
    billingState.freeShopId === undefined &&
    billingState.businessNotificationCutoffAt === undefined &&
    billingState.businessNotificationCutoffVersion === undefined
  );
};

const billingStateLabel = (billingState: ExportRow) => {
  const state = billingState.state;
  if (!isRecord(state) || typeof state.kind !== "string") return "invalid";
  return typeof state.plan === "string" ? `${state.kind}.${state.plan}` : state.kind;
};

const migrationCorrelationId = (organizationId: string) => `${organizationId}${M012_AUDIT_SUFFIX}`;

const sortIssues = (issues: ComplimentaryBusinessVerificationIssue[]) =>
  issues.sort((a, b) =>
    [a.code, a.organizationId ?? "", a.sourceShopId ?? "", a.detail ?? ""]
      .join(":")
      .localeCompare([b.code, b.organizationId ?? "", b.sourceShopId ?? "", b.detail ?? ""].join(":")),
  );

/**
 * Convex exportからm012の実行前後に必要な一意性と対応関係だけを検証する。
 * 氏名、メール、決済情報はreportへ含めない。
 */
export const verifyComplimentaryBusinessExport = (
  input: ComplimentaryBusinessVerificationInput,
  mode: VerificationMode,
  expectedTargetSnapshot?: ComplimentaryBusinessTargetSnapshot,
): ComplimentaryBusinessVerificationReport => {
  const issues: ComplimentaryBusinessVerificationIssue[] = [];
  const organizationsById = new Map(
    input.organizations.map((organization) => [requireString(organization, "_id", "organizations"), organization]),
  );
  const shopsById = new Map(input.shops.map((shop) => [requireString(shop, "_id", "shops"), shop]));
  const targetOrganizations = input.organizations.filter(
    (organization) => optionalString(organization, "migrationSourceShopId", "organizations") !== undefined,
  );
  const targetOrganizationIds = new Set(
    targetOrganizations.map((organization) => requireString(organization, "_id", "organizations")),
  );
  const targetSetSha256 = createHash("sha256")
    .update([...targetOrganizationIds].sort().join("\n"))
    .digest("hex");
  if (targetOrganizations.length === 0) {
    issues.push({ code: "no_target_organizations", count: 0 });
  }
  if (mode === "post") {
    if (!expectedTargetSnapshot) {
      issues.push({ code: "missing_expected_target_snapshot" });
    } else {
      if (targetOrganizations.length !== expectedTargetSnapshot.targetCount) {
        issues.push({
          code: "unexpected_target_count",
          count: targetOrganizations.length,
          detail: `expected:${expectedTargetSnapshot.targetCount}`,
        });
      }
      if (targetSetSha256 !== expectedTargetSnapshot.targetSetSha256) {
        issues.push({
          code: "unexpected_target_set",
          detail: `expected:${expectedTargetSnapshot.targetSetSha256}`,
        });
      }
    }
  }
  const organizationsBySourceShopId = groupBy(targetOrganizations, (organization) =>
    optionalString(organization, "migrationSourceShopId", "organizations"),
  );
  const billingStatesByOrganizationId = groupBy(input.billingStates, (billingState) =>
    requireString(billingState, "organizationId", "organizationBillingStates"),
  );
  const auditsByCorrelationId = groupBy(input.auditEvents, (audit) =>
    optionalString(audit, "correlationId", "organizationAuditEvents"),
  );
  const complimentaryAuditsByOrganizationId = groupBy(
    input.auditEvents.filter(
      (audit) => audit.action === "organization.billing_state_changed" && audit.toState === "complimentary.business",
    ),
    (audit) => requireString(audit, "organizationId", "organizationAuditEvents"),
  );
  const relationshipValidByOrganizationId = new Map<string, boolean>();

  const m012Audits = input.auditEvents.filter((audit) => {
    const correlationId = optionalString(audit, "correlationId", "organizationAuditEvents");
    return (
      correlationId?.endsWith(M012_AUDIT_SUFFIX) === true ||
      (audit.action === "organization.billing_state_changed" && audit.toState === "complimentary.business")
    );
  });
  let nonTargetMigrationAudits = 0;
  let orphanMigrationAudits = 0;
  for (const audit of m012Audits) {
    const correlationId = optionalString(audit, "correlationId", "organizationAuditEvents");
    const auditOrganizationId = requireString(audit, "organizationId", "organizationAuditEvents");
    const ownerOrganizationId = correlationId?.endsWith(M012_AUDIT_SUFFIX)
      ? correlationId.slice(0, -M012_AUDIT_SUFFIX.length)
      : auditOrganizationId;
    const organization = organizationsById.get(ownerOrganizationId);
    if (!organization) {
      orphanMigrationAudits++;
      issues.push({ code: "orphan_migration_audit", organizationId: ownerOrganizationId });
    } else if (!targetOrganizationIds.has(ownerOrganizationId)) {
      nonTargetMigrationAudits++;
      issues.push({ code: "non_target_migration_audit", organizationId: ownerOrganizationId });
    }
  }

  for (const organization of targetOrganizations) {
    const organizationId = requireString(organization, "_id", "organizations");
    const sourceShopId = requireString(organization, "migrationSourceShopId", "organizations");
    const sourceShop = shopsById.get(sourceShopId);
    const sourceOrganizations = organizationsBySourceShopId.get(sourceShopId) ?? [];
    let relationshipValid = true;

    if (!sourceShop) {
      issues.push({ code: "missing_source_shop", organizationId, sourceShopId });
      relationshipValid = false;
    } else if (optionalString(sourceShop, "organizationId", "shops") !== organizationId) {
      issues.push({ code: "source_shop_organization_mismatch", organizationId, sourceShopId });
      relationshipValid = false;
    }

    if (sourceOrganizations.length !== 1) {
      issues.push({
        code: "duplicate_migration_source_shop_id",
        organizationId,
        sourceShopId,
        count: sourceOrganizations.length,
      });
      relationshipValid = false;
    }

    relationshipValidByOrganizationId.set(organizationId, relationshipValid);
  }

  let complimentaryStates = 0;
  let nonTargetComplimentaryStates = 0;
  let orphanComplimentaryStates = 0;
  for (const billingState of input.billingStates) {
    if (!isComplimentaryBusiness(billingState)) continue;
    complimentaryStates++;
    const organizationId = requireString(billingState, "organizationId", "organizationBillingStates");
    const organization = organizationsById.get(organizationId);
    if (!organization) {
      orphanComplimentaryStates++;
      issues.push({ code: "orphan_complimentary_business", organizationId });
      continue;
    }
    if (!targetOrganizationIds.has(organizationId)) {
      nonTargetComplimentaryStates++;
      issues.push({ code: "non_target_complimentary_business", organizationId });
    }
  }

  let migrationReadyTargets = 0;
  let compliantTargets = 0;
  for (const organization of targetOrganizations) {
    const organizationId = requireString(organization, "_id", "organizations");
    const sourceShopId = requireString(organization, "migrationSourceShopId", "organizations");
    const billingStates = billingStatesByOrganizationId.get(organizationId) ?? [];
    const audits = [
      ...new Set([
        ...(auditsByCorrelationId.get(migrationCorrelationId(organizationId)) ?? []),
        ...(complimentaryAuditsByOrganizationId.get(organizationId) ?? []),
      ]),
    ];
    const relationshipValid = relationshipValidByOrganizationId.get(organizationId) === true;

    if (mode === "pre") {
      if (billingStates.length === 0 && relationshipValid) migrationReadyTargets++;
      if (billingStates.length === 1) {
        issues.push({
          code: "existing_billing_state",
          organizationId,
          sourceShopId,
          detail: billingStateLabel(billingStates[0]),
        });
      } else if (billingStates.length > 1) {
        issues.push({ code: "duplicate_billing_states", organizationId, sourceShopId, count: billingStates.length });
      }
      if (audits.length > 0) {
        issues.push({ code: "existing_migration_audit", organizationId, sourceShopId, count: audits.length });
      }
      continue;
    }

    if (billingStates.length === 0) {
      issues.push({ code: "missing_complimentary_business", organizationId, sourceShopId });
    } else if (billingStates.length > 1) {
      issues.push({ code: "duplicate_billing_states", organizationId, sourceShopId, count: billingStates.length });
    } else if (!isCanonicalComplimentaryBusiness(billingStates[0])) {
      issues.push({
        code: "unexpected_billing_state",
        organizationId,
        sourceShopId,
        detail: isComplimentaryBusiness(billingStates[0])
          ? "complimentary.business.invalid_shape"
          : billingStateLabel(billingStates[0]),
      });
    }

    let auditValid = false;
    if (audits.length === 0) {
      issues.push({ code: "missing_migration_audit", organizationId, sourceShopId });
    } else if (audits.length > 1) {
      issues.push({ code: "duplicate_migration_audits", organizationId, sourceShopId, count: audits.length });
    } else {
      const audit = audits[0];
      const billingState = billingStates.length === 1 ? billingStates[0] : undefined;
      const billingStateId = billingState ? requireString(billingState, "_id", "organizationBillingStates") : undefined;
      auditValid =
        billingState !== undefined &&
        isCanonicalComplimentaryBusiness(billingState) &&
        audit.organizationId === organizationId &&
        audit.action === "organization.billing_state_changed" &&
        audit.targetKind === "billing" &&
        audit.targetId === billingStateId &&
        audit.toState === "complimentary.business" &&
        audit.correlationId === migrationCorrelationId(organizationId);
      if (!auditValid) {
        issues.push({ code: "invalid_migration_audit", organizationId, sourceShopId });
      }
    }

    if (
      relationshipValid &&
      billingStates.length === 1 &&
      isCanonicalComplimentaryBusiness(billingStates[0]) &&
      auditValid
    ) {
      compliantTargets++;
    }
  }

  const m012Conflicts = input.migrationConflicts.filter(
    (conflict) => typeof conflict.code === "string" && conflict.code.startsWith(M012_CONFLICT_PREFIX),
  );
  if (mode === "pre") {
    for (const conflict of m012Conflicts) {
      issues.push({
        code: "existing_m012_migration_conflict",
        organizationId: optionalString(conflict, "organizationId", "organizationMigrationConflicts"),
        sourceShopId:
          conflict.sourceType === "shop"
            ? requireString(conflict, "sourceId", "organizationMigrationConflicts")
            : undefined,
        detail: requireString(conflict, "code", "organizationMigrationConflicts"),
      });
    }
  }

  const m012ConflictsByKey = groupBy(m012Conflicts, (conflict) => {
    const sourceType = requireString(conflict, "sourceType", "organizationMigrationConflicts");
    const sourceId = requireString(conflict, "sourceId", "organizationMigrationConflicts");
    const code = requireString(conflict, "code", "organizationMigrationConflicts");
    return `${sourceType}:${sourceId}:${code}`;
  });
  let duplicateM012ConflictKeys = 0;
  for (const conflicts of m012ConflictsByKey.values()) {
    if (conflicts.length < 2) continue;
    duplicateM012ConflictKeys++;
    const conflict = conflicts[0];
    issues.push({
      code: "duplicate_m012_migration_conflicts",
      organizationId: optionalString(conflict, "organizationId", "organizationMigrationConflicts"),
      sourceShopId:
        conflict.sourceType === "shop"
          ? requireString(conflict, "sourceId", "organizationMigrationConflicts")
          : undefined,
      count: conflicts.length,
      detail: requireString(conflict, "code", "organizationMigrationConflicts"),
    });
  }

  const unresolvedConflicts = input.migrationConflicts.filter(
    (conflict) => optionalNumber(conflict, "resolvedAt", "organizationMigrationConflicts") === undefined,
  );
  for (const conflict of unresolvedConflicts) {
    issues.push({
      code: "unresolved_migration_conflict",
      organizationId: optionalString(conflict, "organizationId", "organizationMigrationConflicts"),
      sourceShopId:
        conflict.sourceType === "shop"
          ? optionalString(conflict, "sourceId", "organizationMigrationConflicts")
          : undefined,
      detail: requireString(conflict, "code", "organizationMigrationConflicts"),
    });
  }
  const unresolvedM012Conflicts = unresolvedConflicts.filter((conflict) => m012Conflicts.includes(conflict));

  sortIssues(issues);
  return {
    mode,
    ok: issues.length === 0,
    migrationStatus: "not_verified_by_export",
    targetSetSha256,
    counts: {
      organizations: input.organizations.length,
      targetOrganizations: targetOrganizations.length,
      migrationReadyTargets,
      compliantTargets,
      complimentaryStates,
      nonTargetComplimentaryStates,
      orphanComplimentaryStates,
      m012MigrationAudits: m012Audits.length,
      nonTargetMigrationAudits,
      orphanMigrationAudits,
      unresolvedMigrationConflicts: unresolvedConflicts.length,
      unresolvedM012Conflicts: unresolvedM012Conflicts.length,
      duplicateM012ConflictKeys,
    },
    issues,
  };
};

export const parseJsonLines = (source: string, table: string): ExportRow[] =>
  source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`${table}/documents.jsonl:${index + 1} is not valid JSON`);
      }
      if (!isRecord(value)) {
        throw new Error(`${table}/documents.jsonl:${index + 1} must contain an object`);
      }
      return value;
    });

const readDirectoryExportTable = async (rootDir: string, table: string) => {
  const filePath = path.join(rootDir, table, "documents.jsonl");
  return parseJsonLines(await readFile(filePath, "utf8"), table);
};

const readZipEntries = async (zipPath: string) => {
  const { stdout } = await execFile("/usr/bin/unzip", ["-Z1", zipPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return new Set(
    String(stdout)
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
};

const readZipExportTable = async (zipPath: string, entries: ReadonlySet<string>, table: string) => {
  const entry = `${table}/documents.jsonl`;
  if (!entries.has(entry)) {
    throw new Error(`${entry} is missing from the Convex export ZIP`);
  }
  const { stdout } = await execFile("/usr/bin/unzip", ["-p", zipPath, entry], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return parseJsonLines(String(stdout), table);
};

export const readComplimentaryBusinessExport = async (
  exportPath: string,
): Promise<ComplimentaryBusinessVerificationInput> => {
  const exportStat = await stat(exportPath);
  const entries = exportStat.isDirectory() ? undefined : await readZipEntries(exportPath);
  const readRawTable = (table: string) =>
    entries ? readZipExportTable(exportPath, entries, table) : readDirectoryExportTable(exportPath, table);
  const tableMetadata = await readRawTable("_tables");
  const exportedTableNames = new Set(tableMetadata.map((table) => requireString(table, "name", "_tables")));
  const readTable = (table: string) => {
    if (!exportedTableNames.has(table)) {
      throw new Error(`${table} is not listed in _tables/documents.jsonl`);
    }
    return readRawTable(table);
  };
  const [organizations, shops, billingStates, auditEvents, migrationConflicts] = await Promise.all([
    readTable("organizations"),
    readTable("shops"),
    readTable("organizationBillingStates"),
    readTable("organizationAuditEvents"),
    readTable("organizationMigrationConflicts"),
  ]);
  return { organizations, shops, billingStates, auditEvents, migrationConflicts };
};

export const parseComplimentaryBusinessVerificationArgs = (args: string[]) => {
  let mode: VerificationMode | undefined;
  let exportPath: string | undefined;
  let expectedTargetCount: number | undefined;
  let expectedTargetSetSha256: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--mode") {
      const value = args[index + 1];
      if (value !== "pre" && value !== "post") throw new Error("--mode must be pre or post");
      mode = value;
      index++;
      continue;
    }
    if (arg === "--path") {
      const value = args[index + 1];
      if (!value) throw new Error("--path requires a Convex export ZIP or extracted directory");
      exportPath = value;
      index++;
      continue;
    }
    if (arg === "--expected-target-count") {
      const value = args[index + 1];
      if (!value || !/^\d+$/u.test(value) || Number(value) <= 0) {
        throw new Error("--expected-target-count requires a positive integer");
      }
      expectedTargetCount = Number(value);
      index++;
      continue;
    }
    if (arg === "--expected-target-set-sha256") {
      const value = args[index + 1];
      if (!value || !/^[0-9a-f]{64}$/iu.test(value)) {
        throw new Error("--expected-target-set-sha256 requires a 64-character SHA-256 hex digest");
      }
      expectedTargetSetSha256 = value.toLowerCase();
      index++;
      continue;
    }
    if (arg === "--help") {
      console.log(
        [
          "Usage (pre): tsx scripts/verifyComplimentaryBusinessExport.ts --mode pre --path <export.zip>",
          "Usage (post): tsx scripts/verifyComplimentaryBusinessExport.ts --mode post --path <export.zip> --expected-target-count <count> --expected-target-set-sha256 <sha256>",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!mode) throw new Error("--mode is required");
  if (!exportPath) throw new Error("--path is required");
  if (mode === "post" && (expectedTargetCount === undefined || expectedTargetSetSha256 === undefined)) {
    throw new Error("post mode requires --expected-target-count and --expected-target-set-sha256 from the pre report");
  }
  const expectedTargetSnapshot =
    expectedTargetCount !== undefined && expectedTargetSetSha256 !== undefined
      ? { targetCount: expectedTargetCount, targetSetSha256: expectedTargetSetSha256 }
      : undefined;
  return { mode, exportPath, expectedTargetSnapshot };
};

const main = async () => {
  const { mode, exportPath, expectedTargetSnapshot } = parseComplimentaryBusinessVerificationArgs(
    process.argv.slice(2),
  );
  const input = await readComplimentaryBusinessExport(exportPath);
  const report = verifyComplimentaryBusinessExport(input, mode, expectedTargetSnapshot);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}
