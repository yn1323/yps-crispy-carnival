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

export type ComplimentaryBusinessM021VerificationInput = {
  organizations: ExportRow[];
  billingStates: ExportRow[];
  auditEvents: ExportRow[];
  migrationConflicts: ExportRow[];
  stripeCustomers: ExportRow[];
  stripeSubscriptions: ExportRow[];
  stripeOperations: ExportRow[];
  stripeWebhookEvents: ExportRow[];
  notificationOutbox: ExportRow[];
};

type VerificationIssueCode =
  | "billing_notification_evidence"
  | "duplicate_billing_states"
  | "duplicate_m021_migration_audits"
  | "existing_m021_migration_audit"
  | "invalid_m021_migration_audit"
  | "missing_expected_target_snapshot"
  | "missing_target_billing_state"
  | "no_target_billing_states"
  | "orphan_target_billing_state"
  | "remaining_complimentary_pro"
  | "stripe_customer_evidence"
  | "stripe_operation_evidence"
  | "stripe_subscription_evidence"
  | "stripe_webhook_evidence"
  | "unexpected_target_count"
  | "unexpected_target_set"
  | "unexpected_target_state"
  | "unresolved_m021_migration_conflict";

export type ComplimentaryBusinessM021VerificationIssue = {
  code: VerificationIssueCode;
  organizationId?: string;
  billingStateId?: string;
  count?: number;
  detail?: string;
};

export type ComplimentaryBusinessM021TargetSnapshot = {
  targetCount: number;
  targetSetSha256: string;
};

export type ComplimentaryBusinessM021VerificationReport = {
  mode: VerificationMode;
  ok: boolean;
  migrationStatus: "not_verified_by_export";
  targetSetSha256: string;
  counts: {
    organizations: number;
    preTargetBillingStates: number;
    migrationReadyTargets: number;
    reconstructedTargets: number;
    compliantTargets: number;
    remainingComplimentaryProStates: number;
    m021MigrationAudits: number;
    unresolvedM021Conflicts: number;
    stripeCustomerEvidence: number;
    stripeSubscriptionEvidence: number;
    stripeOperationEvidence: number;
    stripeWebhookEvidence: number;
    billingNotificationEvidence: number;
  };
  issues: ComplimentaryBusinessM021VerificationIssue[];
};

const M021_CONFLICT_PREFIX = "billing_complimentary_pro_to_business_";
const M021_AUDIT_SUFFIX = ":migration:m021:complimentary-pro-to-business";
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

const isComplimentaryPlan = (billingState: ExportRow, plan: "pro" | "business") => {
  const state = billingState.state;
  return isRecord(state) && state.kind === "complimentary" && state.plan === plan;
};

const billingStateLabel = (billingState: ExportRow) => {
  const state = billingState.state;
  if (!isRecord(state) || typeof state.kind !== "string") return "invalid";
  return typeof state.plan === "string" ? `${state.kind}.${state.plan}` : state.kind;
};

const targetPair = (organizationId: string, billingStateId: string) => `${organizationId}|${billingStateId}`;

export const hashComplimentaryBusinessM021TargetSet = (pairs: Iterable<string>) =>
  createHash("sha256")
    .update([...new Set(pairs)].sort().join("\n"))
    .digest("hex");

const migrationCorrelationId = (organizationId: string) => `${organizationId}${M021_AUDIT_SUFFIX}`;

const isM021Audit = (audit: ExportRow) => {
  const correlationId = optionalString(audit, "correlationId", "organizationAuditEvents");
  return correlationId?.endsWith(M021_AUDIT_SUFFIX) === true;
};

const isBillingNotification = (notification: ExportRow) => {
  if (notification.purpose === "billing") return true;
  const payload = notification.payload;
  return isRecord(payload) && typeof payload.context === "string" && payload.context.startsWith("organizationBilling.");
};

const sortIssues = (issues: ComplimentaryBusinessM021VerificationIssue[]) =>
  issues.sort((a, b) =>
    [a.code, a.organizationId ?? "", a.billingStateId ?? "", a.detail ?? ""]
      .join(":")
      .localeCompare([b.code, b.organizationId ?? "", b.billingStateId ?? "", b.detail ?? ""].join(":")),
  );

type Evidence = {
  customers: ExportRow[];
  subscriptions: ExportRow[];
  operations: ExportRow[];
  webhooks: ExportRow[];
  notifications: ExportRow[];
};

const evidenceForOrganization = (
  organizationId: string,
  grouped: {
    customers: Map<string, ExportRow[]>;
    subscriptions: Map<string, ExportRow[]>;
    operations: Map<string, ExportRow[]>;
    webhooks: Map<string, ExportRow[]>;
    notifications: Map<string, ExportRow[]>;
  },
): Evidence => ({
  customers: grouped.customers.get(organizationId) ?? [],
  subscriptions: grouped.subscriptions.get(organizationId) ?? [],
  operations: grouped.operations.get(organizationId) ?? [],
  webhooks: grouped.webhooks.get(organizationId) ?? [],
  notifications: grouped.notifications.get(organizationId) ?? [],
});

const appendEvidenceIssues = (
  issues: ComplimentaryBusinessM021VerificationIssue[],
  organizationId: string,
  evidence: Evidence,
) => {
  if (evidence.customers.length > 0) {
    issues.push({ code: "stripe_customer_evidence", organizationId, count: evidence.customers.length });
  }
  if (evidence.subscriptions.length > 0) {
    issues.push({ code: "stripe_subscription_evidence", organizationId, count: evidence.subscriptions.length });
  }
  if (evidence.operations.length > 0) {
    issues.push({ code: "stripe_operation_evidence", organizationId, count: evidence.operations.length });
  }
  if (evidence.webhooks.length > 0) {
    issues.push({ code: "stripe_webhook_evidence", organizationId, count: evidence.webhooks.length });
  }
  if (evidence.notifications.length > 0) {
    issues.push({ code: "billing_notification_evidence", organizationId, count: evidence.notifications.length });
  }
};

/**
 * m021前後の対象集合と、無償契約がStripeから隔離されていることだけをexportから検証する。
 * migration workerの完走状態はsnapshotに含まれないため、別途lib:getStatusで確認する。
 */
export const verifyComplimentaryBusinessM021Export = (
  input: ComplimentaryBusinessM021VerificationInput,
  mode: VerificationMode,
  expectedTargetSnapshot?: ComplimentaryBusinessM021TargetSnapshot,
): ComplimentaryBusinessM021VerificationReport => {
  const issues: ComplimentaryBusinessM021VerificationIssue[] = [];
  const organizationsById = new Map(
    input.organizations.map((organization) => [requireString(organization, "_id", "organizations"), organization]),
  );
  const billingStatesById = new Map(
    input.billingStates.map((billingState) => [
      requireString(billingState, "_id", "organizationBillingStates"),
      billingState,
    ]),
  );
  const billingStatesByOrganizationId = groupBy(input.billingStates, (billingState) =>
    requireString(billingState, "organizationId", "organizationBillingStates"),
  );
  const preTargets = input.billingStates.filter((billingState) => isComplimentaryPlan(billingState, "pro"));
  const m021Audits = input.auditEvents.filter(isM021Audit);
  const unresolvedM021Conflicts = input.migrationConflicts.filter(
    (conflict) =>
      typeof conflict.code === "string" &&
      conflict.code.startsWith(M021_CONFLICT_PREFIX) &&
      optionalNumber(conflict, "resolvedAt", "organizationMigrationConflicts") === undefined,
  );
  const groupedEvidence = {
    customers: groupBy(input.stripeCustomers, (row) =>
      requireString(row, "organizationId", "organizationStripeCustomers"),
    ),
    subscriptions: groupBy(input.stripeSubscriptions, (row) =>
      requireString(row, "organizationId", "organizationStripeSubscriptions"),
    ),
    operations: groupBy(input.stripeOperations, (row) =>
      requireString(row, "organizationId", "organizationStripeOperations"),
    ),
    webhooks: groupBy(input.stripeWebhookEvents, (row) => optionalString(row, "organizationId", "stripeWebhookEvents")),
    notifications: groupBy(input.notificationOutbox.filter(isBillingNotification), (row) =>
      optionalString(row, "organizationId", "notificationOutbox"),
    ),
  };

  for (const conflict of unresolvedM021Conflicts) {
    issues.push({
      code: "unresolved_m021_migration_conflict",
      organizationId: optionalString(conflict, "organizationId", "organizationMigrationConflicts"),
      detail: requireString(conflict, "code", "organizationMigrationConflicts"),
    });
  }

  const reconstructedPairs = new Set<string>();
  const validAuditByPair = new Map<string, ExportRow[]>();
  if (mode === "pre") {
    for (const audit of m021Audits) {
      issues.push({
        code: "existing_m021_migration_audit",
        organizationId: optionalString(audit, "organizationId", "organizationAuditEvents"),
      });
    }
  } else {
    for (const audit of m021Audits) {
      const organizationId = optionalString(audit, "organizationId", "organizationAuditEvents");
      const billingStateId = optionalString(audit, "targetId", "organizationAuditEvents");
      if (!organizationId || !billingStateId) {
        issues.push({ code: "invalid_m021_migration_audit", organizationId, billingStateId });
        continue;
      }
      const pair = targetPair(organizationId, billingStateId);
      reconstructedPairs.add(pair);
      const current = validAuditByPair.get(pair) ?? [];
      current.push(audit);
      validAuditByPair.set(pair, current);
    }
  }

  const prePairs = preTargets.map((billingState) =>
    targetPair(
      requireString(billingState, "organizationId", "organizationBillingStates"),
      requireString(billingState, "_id", "organizationBillingStates"),
    ),
  );
  const selectedPairs = mode === "pre" ? prePairs : [...reconstructedPairs];
  const targetSetSha256 = hashComplimentaryBusinessM021TargetSet(selectedPairs);

  if (mode === "pre" && preTargets.length === 0) {
    issues.push({ code: "no_target_billing_states", count: 0 });
  }
  if (mode === "post") {
    if (!expectedTargetSnapshot) {
      issues.push({ code: "missing_expected_target_snapshot" });
    } else {
      if (reconstructedPairs.size !== expectedTargetSnapshot.targetCount) {
        issues.push({
          code: "unexpected_target_count",
          count: reconstructedPairs.size,
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

  let migrationReadyTargets = 0;
  let compliantTargets = 0;
  const checkedPreOrganizations = new Set<string>();
  for (const billingState of preTargets) {
    const organizationId = requireString(billingState, "organizationId", "organizationBillingStates");
    const billingStateId = requireString(billingState, "_id", "organizationBillingStates");
    if (!organizationsById.has(organizationId)) {
      issues.push({ code: "orphan_target_billing_state", organizationId, billingStateId });
    }
    if (mode === "post") {
      issues.push({ code: "remaining_complimentary_pro", organizationId, billingStateId });
      continue;
    }
    if (checkedPreOrganizations.has(organizationId)) continue;
    checkedPreOrganizations.add(organizationId);
    const organizationBillingStates = billingStatesByOrganizationId.get(organizationId) ?? [];
    if (organizationBillingStates.length !== 1) {
      issues.push({
        code: "duplicate_billing_states",
        organizationId,
        billingStateId,
        count: organizationBillingStates.length,
      });
    }
    const evidence = evidenceForOrganization(organizationId, groupedEvidence);
    appendEvidenceIssues(issues, organizationId, evidence);
    const hasOwnedConflict = unresolvedM021Conflicts.some((conflict) => conflict.sourceId === organizationId);
    const hasMigrationAudit = m021Audits.some((audit) => audit.organizationId === organizationId);
    const hasEvidence = Object.values(evidence).some((rows) => rows.length > 0);
    if (
      organizationsById.has(organizationId) &&
      organizationBillingStates.length === 1 &&
      !hasEvidence &&
      !hasOwnedConflict &&
      !hasMigrationAudit
    ) {
      migrationReadyTargets++;
    }
  }

  if (mode === "post") {
    for (const [pair, audits] of validAuditByPair) {
      const separator = pair.indexOf("|");
      const organizationId = pair.slice(0, separator);
      const billingStateId = pair.slice(separator + 1);
      const audit = audits[0];
      const billingState = billingStatesById.get(billingStateId);
      const organizationBillingStates = billingStatesByOrganizationId.get(organizationId) ?? [];
      if (audits.length !== 1) {
        issues.push({
          code: "duplicate_m021_migration_audits",
          organizationId,
          billingStateId,
          count: audits.length,
        });
      }
      const auditValid =
        audit.organizationId === organizationId &&
        audit.action === "organization.billing_state_changed" &&
        audit.targetKind === "billing" &&
        audit.targetId === billingStateId &&
        audit.fromState === "complimentary.pro" &&
        audit.toState === "complimentary.business" &&
        audit.correlationId === migrationCorrelationId(organizationId);
      if (!auditValid) {
        issues.push({ code: "invalid_m021_migration_audit", organizationId, billingStateId });
      }
      if (!billingState) {
        issues.push({ code: "missing_target_billing_state", organizationId, billingStateId });
      } else if (billingState.organizationId !== organizationId || !isComplimentaryPlan(billingState, "business")) {
        issues.push({
          code: "unexpected_target_state",
          organizationId,
          billingStateId,
          detail: billingStateLabel(billingState),
        });
      }
      if (!organizationsById.has(organizationId)) {
        issues.push({ code: "orphan_target_billing_state", organizationId, billingStateId });
      }
      if (organizationBillingStates.length > 1) {
        issues.push({
          code: "duplicate_billing_states",
          organizationId,
          billingStateId,
          count: organizationBillingStates.length,
        });
      }
      const evidence = evidenceForOrganization(organizationId, groupedEvidence);
      appendEvidenceIssues(issues, organizationId, evidence);
      const hasEvidence = Object.values(evidence).some((rows) => rows.length > 0);
      if (
        audits.length === 1 &&
        auditValid &&
        billingState !== undefined &&
        billingState.organizationId === organizationId &&
        isComplimentaryPlan(billingState, "business") &&
        organizationsById.has(organizationId) &&
        organizationBillingStates.length === 1 &&
        !hasEvidence
      ) {
        compliantTargets++;
      }
    }
  }

  const targetOrganizationIds = new Set(
    mode === "pre"
      ? preTargets.map((row) => requireString(row, "organizationId", "organizationBillingStates"))
      : [...reconstructedPairs].map((pair) => pair.slice(0, pair.indexOf("|"))),
  );
  const evidenceCounts = [...targetOrganizationIds].reduce(
    (counts, organizationId) => {
      const evidence = evidenceForOrganization(organizationId, groupedEvidence);
      counts.customers += evidence.customers.length;
      counts.subscriptions += evidence.subscriptions.length;
      counts.operations += evidence.operations.length;
      counts.webhooks += evidence.webhooks.length;
      counts.notifications += evidence.notifications.length;
      return counts;
    },
    { customers: 0, subscriptions: 0, operations: 0, webhooks: 0, notifications: 0 },
  );

  sortIssues(issues);
  return {
    mode,
    ok: issues.length === 0,
    migrationStatus: "not_verified_by_export",
    targetSetSha256,
    counts: {
      organizations: input.organizations.length,
      preTargetBillingStates: mode === "pre" ? preTargets.length : 0,
      migrationReadyTargets,
      reconstructedTargets: mode === "post" ? reconstructedPairs.size : 0,
      compliantTargets,
      remainingComplimentaryProStates: preTargets.length,
      m021MigrationAudits: m021Audits.length,
      unresolvedM021Conflicts: unresolvedM021Conflicts.length,
      stripeCustomerEvidence: evidenceCounts.customers,
      stripeSubscriptionEvidence: evidenceCounts.subscriptions,
      stripeOperationEvidence: evidenceCounts.operations,
      stripeWebhookEvidence: evidenceCounts.webhooks,
      billingNotificationEvidence: evidenceCounts.notifications,
    },
    issues,
  };
};

export const parseComplimentaryBusinessM021JsonLines = (source: string, table: string): ExportRow[] =>
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

const readDirectoryExportTable = async (rootDir: string, table: string) =>
  parseComplimentaryBusinessM021JsonLines(await readFile(path.join(rootDir, table, "documents.jsonl"), "utf8"), table);

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
  if (!entries.has(entry)) throw new Error(`${entry} is missing from the Convex export ZIP`);
  const { stdout } = await execFile("/usr/bin/unzip", ["-p", zipPath, entry], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return parseComplimentaryBusinessM021JsonLines(String(stdout), table);
};

const REQUIRED_TABLES = [
  "organizations",
  "organizationBillingStates",
  "organizationAuditEvents",
  "organizationMigrationConflicts",
  "organizationStripeCustomers",
  "organizationStripeSubscriptions",
  "organizationStripeOperations",
  "stripeWebhookEvents",
  "notificationOutbox",
] as const;

export const readComplimentaryBusinessM021Export = async (
  exportPath: string,
): Promise<ComplimentaryBusinessM021VerificationInput> => {
  const exportStat = await stat(exportPath);
  const entries = exportStat.isDirectory() ? undefined : await readZipEntries(exportPath);
  const readRawTable = (table: string) =>
    entries ? readZipExportTable(exportPath, entries, table) : readDirectoryExportTable(exportPath, table);
  const tableMetadata = await readRawTable("_tables");
  const exportedTableNames = new Set(tableMetadata.map((table) => requireString(table, "name", "_tables")));
  const readTable = (table: (typeof REQUIRED_TABLES)[number]) => {
    if (!exportedTableNames.has(table)) throw new Error(`${table} is not listed in _tables/documents.jsonl`);
    return readRawTable(table);
  };
  const [
    organizations,
    billingStates,
    auditEvents,
    migrationConflicts,
    stripeCustomers,
    stripeSubscriptions,
    stripeOperations,
    stripeWebhookEvents,
    notificationOutbox,
  ] = await Promise.all(REQUIRED_TABLES.map(readTable));
  return {
    organizations,
    billingStates,
    auditEvents,
    migrationConflicts,
    stripeCustomers,
    stripeSubscriptions,
    stripeOperations,
    stripeWebhookEvents,
    notificationOutbox,
  };
};

export const parseComplimentaryBusinessM021VerificationArgs = (args: string[]) => {
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
          "Usage (pre): tsx scripts/verifyComplimentaryBusinessM021Export.ts --mode pre --path <export.zip>",
          "Usage (post): tsx scripts/verifyComplimentaryBusinessM021Export.ts --mode post --path <export.zip> --expected-target-count <count> --expected-target-set-sha256 <sha256>",
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
  const { mode, exportPath, expectedTargetSnapshot } = parseComplimentaryBusinessM021VerificationArgs(
    process.argv.slice(2),
  );
  const input = await readComplimentaryBusinessM021Export(exportPath);
  const report = verifyComplimentaryBusinessM021Export(input, mode, expectedTargetSnapshot);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}
