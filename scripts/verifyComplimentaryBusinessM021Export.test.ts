import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  type ComplimentaryBusinessM021TargetSnapshot,
  type ComplimentaryBusinessM021VerificationInput,
  hashComplimentaryBusinessM021TargetSet,
  parseComplimentaryBusinessM021JsonLines,
  parseComplimentaryBusinessM021VerificationArgs,
  readComplimentaryBusinessM021Export,
  verifyComplimentaryBusinessM021Export,
} from "./verifyComplimentaryBusinessM021Export";

const execFile = promisify(execFileCallback);
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

const emptyInput = (): ComplimentaryBusinessM021VerificationInput => ({
  organizations: [],
  billingStates: [],
  auditEvents: [],
  migrationConflicts: [],
  stripeCustomers: [],
  stripeSubscriptions: [],
  stripeOperations: [],
  stripeWebhookEvents: [],
  notificationOutbox: [],
});

const complimentaryState = (id: string, organizationId: string, plan: "pro" | "business") => ({
  _id: id,
  organizationId,
  state: { kind: "complimentary", plan },
  version: plan === "pro" ? 1 : 2,
});

const migrationAudit = (id: string, organizationId: string, billingStateId: string) => ({
  _id: id,
  organizationId,
  action: "organization.billing_state_changed",
  targetKind: "billing",
  targetId: billingStateId,
  fromState: "complimentary.pro",
  toState: "complimentary.business",
  correlationId: `${organizationId}:migration:m021:complimentary-pro-to-business`,
});

const snapshotFor = (pairs: string[]): ComplimentaryBusinessM021TargetSnapshot => ({
  targetCount: new Set(pairs).size,
  targetSetSha256: hashComplimentaryBusinessM021TargetSet(pairs),
});

describe("verifyComplimentaryBusinessM021Export", () => {
  it("preではcomplimentary.proのorganizationId|billingStateId集合を記録して移行可能と判定する", () => {
    const input = emptyInput();
    input.organizations = [{ _id: "organization-b" }, { _id: "organization-a" }, { _id: "organization-other" }];
    input.billingStates = [
      complimentaryState("billing-b", "organization-b", "pro"),
      complimentaryState("billing-a", "organization-a", "pro"),
      { _id: "billing-other", organizationId: "organization-other", state: { kind: "active", plan: "business" } },
    ];

    const report = verifyComplimentaryBusinessM021Export(input, "pre");

    expect(report).toEqual({
      mode: "pre",
      ok: true,
      migrationStatus: "not_verified_by_export",
      targetSetSha256: hashComplimentaryBusinessM021TargetSet(["organization-a|billing-a", "organization-b|billing-b"]),
      counts: {
        organizations: 3,
        preTargetBillingStates: 2,
        migrationReadyTargets: 2,
        reconstructedTargets: 0,
        compliantTargets: 0,
        remainingComplimentaryProStates: 2,
        m021MigrationAudits: 0,
        unresolvedM021Conflicts: 0,
        stripeCustomerEvidence: 0,
        stripeSubscriptionEvidence: 0,
        stripeOperationEvidence: 0,
        stripeWebhookEvidence: 0,
        billingNotificationEvidence: 0,
      },
      issues: [],
    });
  });

  it("preでは対象0件をGo判定にしない", () => {
    const report = verifyComplimentaryBusinessM021Export(emptyInput(), "pre");

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([{ code: "no_target_billing_states", count: 0 }]);
  });

  it("preではorganization欠損、課金状態重複、全Stripe証跡、全statusの課金通知をfail-closedにする", () => {
    const input = emptyInput();
    input.organizations = [{ _id: "organization-evidence" }];
    input.billingStates = [
      complimentaryState("billing-orphan", "organization-orphan", "pro"),
      complimentaryState("billing-evidence", "organization-evidence", "pro"),
      { _id: "billing-duplicate", organizationId: "organization-evidence", state: { kind: "active", plan: "free" } },
    ];
    input.stripeCustomers = [{ _id: "customer", organizationId: "organization-evidence" }];
    input.stripeSubscriptions = [{ _id: "subscription", organizationId: "organization-evidence" }];
    input.stripeOperations = [
      { _id: "operation-succeeded", organizationId: "organization-evidence", status: "succeeded" },
      { _id: "operation-cancelled", organizationId: "organization-evidence", status: "cancelled" },
    ];
    input.stripeWebhookEvents = [{ _id: "webhook", organizationId: "organization-evidence" }];
    input.notificationOutbox = [
      { _id: "notification-sent", organizationId: "organization-evidence", purpose: "billing", status: "sent" },
      {
        _id: "notification-cancelled",
        organizationId: "organization-evidence",
        status: "cancelled",
        payload: { context: "organizationBilling.planActivated" },
      },
    ];

    const report = verifyComplimentaryBusinessM021Export(input, "pre");

    expect(report.ok).toBe(false);
    expect(report.counts).toMatchObject({
      stripeCustomerEvidence: 1,
      stripeSubscriptionEvidence: 1,
      stripeOperationEvidence: 2,
      stripeWebhookEvidence: 1,
      billingNotificationEvidence: 2,
    });
    expect(report.issues).toEqual([
      { code: "billing_notification_evidence", organizationId: "organization-evidence", count: 2 },
      {
        code: "duplicate_billing_states",
        organizationId: "organization-evidence",
        billingStateId: "billing-evidence",
        count: 2,
      },
      {
        code: "orphan_target_billing_state",
        organizationId: "organization-orphan",
        billingStateId: "billing-orphan",
      },
      { code: "stripe_customer_evidence", organizationId: "organization-evidence", count: 1 },
      { code: "stripe_operation_evidence", organizationId: "organization-evidence", count: 2 },
      { code: "stripe_subscription_evidence", organizationId: "organization-evidence", count: 1 },
      { code: "stripe_webhook_evidence", organizationId: "organization-evidence", count: 1 },
    ]);
  });

  it("preでは先行m021監査と未解消m021 conflictを拒否するが、解消済みconflictは許容する", () => {
    const input = emptyInput();
    input.organizations = [{ _id: "organization-a" }];
    input.billingStates = [complimentaryState("billing-a", "organization-a", "pro")];
    input.auditEvents = [migrationAudit("audit-a", "organization-a", "billing-a")];
    input.migrationConflicts = [
      {
        _id: "conflict-unresolved",
        organizationId: "organization-a",
        sourceType: "organization",
        sourceId: "organization-a",
        code: "billing_complimentary_pro_to_business_stripe_operation_evidence",
      },
      {
        _id: "conflict-resolved",
        organizationId: "organization-a",
        sourceType: "organization",
        sourceId: "organization-a",
        code: "billing_complimentary_pro_to_business_stripe_customer_evidence",
        resolvedAt: 100,
      },
    ];

    const report = verifyComplimentaryBusinessM021Export(input, "pre");

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      { code: "existing_m021_migration_audit", organizationId: "organization-a" },
      {
        code: "unresolved_m021_migration_conflict",
        organizationId: "organization-a",
        detail: "billing_complimentary_pro_to_business_stripe_operation_evidence",
      },
    ]);
  });

  it("postではm021監査からpreと同じ集合を再構成し、Business・監査・隔離を一対一で確認する", () => {
    const input = emptyInput();
    input.organizations = [{ _id: "organization-a" }, { _id: "organization-b" }];
    input.billingStates = [
      complimentaryState("billing-a", "organization-a", "business"),
      complimentaryState("billing-b", "organization-b", "business"),
    ];
    input.auditEvents = [
      migrationAudit("audit-b", "organization-b", "billing-b"),
      migrationAudit("audit-a", "organization-a", "billing-a"),
    ];
    input.migrationConflicts = [
      {
        _id: "resolved-conflict",
        organizationId: "organization-a",
        sourceType: "organization",
        sourceId: "organization-a",
        code: "billing_complimentary_pro_to_business_stripe_operation_evidence",
        resolvedAt: 100,
      },
    ];
    const expected = snapshotFor(["organization-a|billing-a", "organization-b|billing-b"]);

    const report = verifyComplimentaryBusinessM021Export(input, "post", expected);

    expect(report.ok).toBe(true);
    expect(report.targetSetSha256).toBe(expected.targetSetSha256);
    expect(report.counts).toMatchObject({
      reconstructedTargets: 2,
      compliantTargets: 2,
      remainingComplimentaryProStates: 0,
      m021MigrationAudits: 2,
      unresolvedM021Conflicts: 0,
    });
    expect(report.issues).toEqual([]);
  });

  it("postでは残存Pro、重複・不正・対象外監査、対象状態不一致、Stripe証跡を検出する", () => {
    const input = emptyInput();
    input.organizations = [{ _id: "organization-a" }, { _id: "organization-b" }];
    input.billingStates = [
      complimentaryState("billing-a", "organization-a", "business"),
      complimentaryState("billing-b", "organization-b", "pro"),
    ];
    input.auditEvents = [
      migrationAudit("audit-a-1", "organization-a", "billing-a"),
      migrationAudit("audit-a-2", "organization-a", "billing-a"),
      { ...migrationAudit("audit-b", "organization-b", "billing-b"), fromState: "active.pro" },
      migrationAudit("audit-extra", "organization-extra", "billing-extra"),
    ];
    input.stripeOperations = [{ _id: "operation", organizationId: "organization-a", status: "failed" }];
    const expected = snapshotFor(["organization-a|billing-a", "organization-b|billing-b"]);

    const report = verifyComplimentaryBusinessM021Export(input, "post", expected);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "duplicate_m021_migration_audits",
      "invalid_m021_migration_audit",
      "missing_target_billing_state",
      "orphan_target_billing_state",
      "remaining_complimentary_pro",
      "stripe_operation_evidence",
      "unexpected_target_count",
      "unexpected_target_set",
      "unexpected_target_state",
    ]);
  });
});

describe("parseComplimentaryBusinessM021JsonLines", () => {
  it("空行を除外し、壊れたJSONとobject以外をfail-closedにする", () => {
    expect(parseComplimentaryBusinessM021JsonLines('{"_id":"a"}\n\n{"_id":"b"}\n', "organizations")).toEqual([
      { _id: "a" },
      { _id: "b" },
    ]);
    expect(() => parseComplimentaryBusinessM021JsonLines("not-json", "organizations")).toThrow(
      "organizations/documents.jsonl:1 is not valid JSON",
    );
    expect(() => parseComplimentaryBusinessM021JsonLines("[]", "organizations")).toThrow(
      "organizations/documents.jsonl:1 must contain an object",
    );
  });
});

describe("parseComplimentaryBusinessM021VerificationArgs", () => {
  it("preとpostの必須引数を検証する", () => {
    expect(
      parseComplimentaryBusinessM021VerificationArgs(["--", "--mode", "pre", "--path", "/safe/export.zip"]),
    ).toEqual({ mode: "pre", exportPath: "/safe/export.zip", expectedTargetSnapshot: undefined });
    expect(() =>
      parseComplimentaryBusinessM021VerificationArgs(["--mode", "post", "--path", "/safe/export.zip"]),
    ).toThrow("post mode requires --expected-target-count and --expected-target-set-sha256 from the pre report");
    expect(
      parseComplimentaryBusinessM021VerificationArgs([
        "--mode",
        "post",
        "--path",
        "/safe/export.zip",
        "--expected-target-count",
        "2",
        "--expected-target-set-sha256",
        "A".repeat(64),
      ]),
    ).toEqual({
      mode: "post",
      exportPath: "/safe/export.zip",
      expectedTargetSnapshot: { targetCount: 2, targetSetSha256: "a".repeat(64) },
    });
  });
});

describe("readComplimentaryBusinessM021Export", () => {
  it("manifestまたは必須documents欠損をfail-closedにする", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "m021-export-"));
    try {
      await mkdir(path.join(rootDir, "_tables"));
      await writeFile(
        path.join(rootDir, "_tables", "documents.jsonl"),
        `${REQUIRED_TABLES.map((table) => JSON.stringify({ name: table })).join("\n")}\n`,
      );
      await mkdir(path.join(rootDir, "organizations"));
      await writeFile(path.join(rootDir, "organizations", "documents.jsonl"), '{"_id":"organization-a"}\n');

      await expect(readComplimentaryBusinessM021Export(rootDir)).rejects.toThrow(/documents\.jsonl/u);

      for (const table of REQUIRED_TABLES.slice(1)) {
        await mkdir(path.join(rootDir, table));
        await writeFile(path.join(rootDir, table, "documents.jsonl"), "");
      }
      await expect(readComplimentaryBusinessM021Export(rootDir)).resolves.toMatchObject({
        organizations: [{ _id: "organization-a" }],
        billingStates: [],
        stripeOperations: [],
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("Convex export ZIPを展開せずに全必須tableを読む", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "m021-export-zip-"));
    const extractedDir = path.join(rootDir, "export");
    const zipPath = path.join(rootDir, "export.zip");
    try {
      await mkdir(path.join(extractedDir, "_tables"), { recursive: true });
      await writeFile(
        path.join(extractedDir, "_tables", "documents.jsonl"),
        `${REQUIRED_TABLES.map((table) => JSON.stringify({ name: table })).join("\n")}\n`,
      );
      for (const table of REQUIRED_TABLES) {
        await mkdir(path.join(extractedDir, table));
        await writeFile(
          path.join(extractedDir, table, "documents.jsonl"),
          table === "organizations" ? '{"_id":"organization-a"}\n' : "",
        );
      }
      await execFile("/usr/bin/zip", ["-qr", zipPath, "."], { cwd: extractedDir });

      await expect(readComplimentaryBusinessM021Export(zipPath)).resolves.toMatchObject({
        organizations: [{ _id: "organization-a" }],
        auditEvents: [],
        notificationOutbox: [],
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
