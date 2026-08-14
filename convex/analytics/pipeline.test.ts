import { type FunctionReference, makeFunctionReference } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { jstDayRangeMs } from "../_lib/dateFormat";
import { SCENARIO_NOW } from "../_test/scenarioBuilders";
import { seedCanonicalStaffLineRecipient, seedOrganizationManagerShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getAnalyticsReadState, getCompleteRunRange } from "../analyticsDashboard/queryHelpers";
import { DAY_MS, HOUR_MS } from "../constants";
import { ANALYTICS_CALCULATION_VERSION, emptyHealthSignalCounts, emptyMilestoneCounts } from "./model";
import { formatAnalyticsLog, safeAnalyticsErrorCode } from "./observability";
import { applySourceEvent, applySourceEventPage, finalizeCycleAtCutoff } from "./projection";
import { ANALYTICS_POLICY } from "./registry";
import { createDailyRun } from "./runs";
import { recordAnalyticsSourceEvent } from "./sourceEvents";

type ResetArgs = {
  confirmed: true;
  deploymentLabel: string;
  revision: string;
  sourceCaptureStartAt: string;
  calculationVersion: number;
};

const resetDryRunRef = makeFunctionReference<
  "mutation",
  ResetArgs,
  {
    allowed: boolean;
    configured: {
      deploymentLabel: string;
      revision: string;
      sourceCaptureStartAt: number | null;
      enabledUntil: number | null;
      nightlyCronEnabled: boolean;
    };
  }
>("analytics/reset:dryRun") as unknown as FunctionReference<
  "mutation",
  "internal",
  ResetArgs,
  {
    allowed: boolean;
    configured: {
      deploymentLabel: string;
      revision: string;
      sourceCaptureStartAt: number | null;
      enabledUntil: number | null;
      nightlyCronEnabled: boolean;
    };
  }
>;

const resetStartRef = makeFunctionReference<"mutation", ResetArgs, { runId: Id<"analyticsRuns">; runKey: string }>(
  "analytics/reset:start",
) as unknown as FunctionReference<"mutation", "internal", ResetArgs, { runId: Id<"analyticsRuns">; runKey: string }>;

type StepArgs = {
  runId: Id<"analyticsRuns">;
  kind: "daily" | "reset" | "maintenance";
  stepVersion: number;
  stage: string;
  cursor?: string;
  substage?: string;
};

const resetProcessPageRef = makeFunctionReference<"mutation", StepArgs, null>(
  "analytics/reset:processPage",
) as unknown as FunctionReference<"mutation", "internal", StepArgs, null>;

const nightlyProcessStepRef = makeFunctionReference<"action", StepArgs, null>(
  "analytics/nightly:processStep",
) as unknown as FunctionReference<"action", "internal", StepArgs, null>;

const nightlyProcessPageRef = makeFunctionReference<"mutation", StepArgs, null>(
  "analytics/nightly:processPage",
) as unknown as FunctionReference<"mutation", "internal", StepArgs, null>;

const DATA_START_DATE = "2026-05-05";
const DATA_START_AT = jstDayRangeMs(DATA_START_DATE).startMs;
const DATA_START_JST = "20260505000000";
const SOURCE_CAPTURE_START_AT = DATA_START_AT - DAY_MS;
const SOURCE_CAPTURE_START_JST = "20260504000000";
const RESET_DEPLOYMENT = "dev:analytics-test";
const RESET_REVISION = "analytics-reset-v1";

type RunFixture = {
  kind: Doc<"analyticsRuns">["kind"];
  status: Doc<"analyticsRuns">["status"];
  startedAt: number;
  targetDate?: string;
  runKey?: string;
  stage?: Doc<"analyticsRuns">["stage"];
  stepVersion?: number;
  inputFromAt?: number;
  cutoffAt?: number;
  sourceCaptureStartAt?: number;
};

async function insertRun(ctx: MutationCtx, args: RunFixture) {
  const cutoffAt = args.cutoffAt ?? (args.targetDate ? jstDayRangeMs(args.targetDate).endMs : args.startedAt);
  return await ctx.db.insert("analyticsRuns", {
    runKey: args.runKey ?? `${args.kind}:${args.targetDate ?? args.startedAt}`,
    kind: args.kind,
    status: args.status,
    calculationVersion: ANALYTICS_CALCULATION_VERSION,
    dataStartDate: DATA_START_DATE,
    dataStartAt: DATA_START_AT,
    ...(args.targetDate ? { targetDate: args.targetDate } : {}),
    inputFromAt: args.inputFromAt ?? SOURCE_CAPTURE_START_AT,
    cutoffAt,
    ...(args.sourceCaptureStartAt !== undefined
      ? { sourceCaptureStartAt: args.sourceCaptureStartAt }
      : args.kind === "reset"
        ? { sourceCaptureStartAt: SOURCE_CAPTURE_START_AT }
        : {}),
    stage: args.stage ?? (args.kind === "daily" ? "publish" : "resetVerify"),
    stepVersion: args.stepVersion ?? 1,
    startedAt: args.startedAt,
    ...(args.status === "running" ? {} : { terminalAt: args.startedAt + 1 }),
    updatedAt: args.startedAt + 1,
  });
}

async function insertServiceKpi(
  ctx: MutationCtx,
  args: { runId: Id<"analyticsRuns">; snapshotDate: string; organizationCount: number },
) {
  return await ctx.db.insert("analyticsDailyServiceKpis", {
    runId: args.runId,
    snapshotDate: args.snapshotDate,
    organizationCount: args.organizationCount,
    shopCount: args.organizationCount,
    kpiEligibleShopCount: args.organizationCount,
    activeShopCount: args.organizationCount,
    personCount: args.organizationCount,
    staffMembershipCount: args.organizationCount,
    unlinkedStaffCount: 0,
    shiftTargetCount: args.organizationCount,
    managerMembershipCount: args.organizationCount,
    managerStaffCount: 0,
    milestoneCounts: emptyMilestoneCounts(),
    healthSignalCounts: emptyHealthSignalCounts(),
    northStar: { numerator: 0, denominator: 0 },
    deadlineSubmission: { numerator: 0, denominator: 0 },
    finalSubmission: { numerator: 0, denominator: 0 },
    completeness: "complete",
    computedAt: SCENARIO_NOW,
  });
}

async function insertAnalyticsOrganizationFixture(ctx: MutationCtx, suffix: string) {
  const organizationId = await ctx.db.insert("organizations", {
    name: `fixture-${suffix}`,
    isDeleted: false,
    createdAt: SCENARIO_NOW - 1,
    updatedAt: SCENARIO_NOW - 1,
  });
  return await ctx.db.insert("analyticsOrganizations", {
    organizationId,
    displayName: `fixture-${suffix}`,
    registeredAt: SCENARIO_NOW - 1,
    updatedAt: SCENARIO_NOW - 1,
  });
}

async function scheduledFunctions(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
}

async function getOverview(
  t: TestConvex<typeof schema>,
  from: string,
  to = from,
  comparison: { from: string; to: string } | null = null,
) {
  return await t.query(internal.analyticsDashboard.queries.getOverview, {
    from,
    to,
    compareFrom: comparison?.from ?? null,
    compareTo: comparison?.to ?? null,
    organizationId: null,
    shopId: null,
  });
}

function stubResetConfiguration(enabledUntil = SCENARIO_NOW + DAY_MS) {
  vi.stubEnv("ANALYTICS_DEPLOYMENT_LABEL", RESET_DEPLOYMENT);
  vi.stubEnv("ANALYTICS_EXPECTED_REVISION", RESET_REVISION);
  vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", SOURCE_CAPTURE_START_JST);
  vi.stubEnv("ANALYTICS_RESET_ENABLED_UNTIL", String(enabledUntil));
  vi.stubEnv("ANALYTICS_NIGHTLY_CRON_ENABLED", "false");
}

function resetArgs(overrides: Partial<ResetArgs> = {}): ResetArgs {
  return {
    confirmed: true,
    deploymentLabel: RESET_DEPLOYMENT,
    revision: RESET_REVISION,
    sourceCaptureStartAt: SOURCE_CAPTURE_START_JST,
    calculationVersion: ANALYTICS_CALCULATION_VERSION,
    ...overrides,
  };
}

describe("Analytics simplified control plane", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("旧bootstrapはpending jobを作らず、新しいreset/nightlyへの移行を明示する", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.analytics.pipeline.startBootstrap, { generation: "retired-bootstrap" }),
    ).rejects.toThrow("Analytics legacy pipeline is retired");
    await expect(t.mutation(internal.analytics.pipeline.recoverJobs, {})).resolves.toBeNull();

    expect(await t.run(async (ctx) => await ctx.db.query("analyticsRuns").collect())).toEqual([]);
    expect(await scheduledFunctions(t)).toEqual([]);
  });

  it("resetはcanonical LINE状態をstaff membershipへ保持し、legacy rowを読まない", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "analytics_reset_line_canonical",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.personId,
        name: "canonical LINEスタッフ",
        email: "canonical-line@example.com",
        emailNormalized: "canonical-line@example.com",
        isDeleted: false,
      });
      await seedStaffLineAccount(ctx, {
        shopId: seeded.shopId,
        staffId,
        lineUserId: "U_analytics_legacy_ignored",
        following: false,
      });
      await seedCanonicalStaffLineRecipient(ctx, { staffId, lineUserId: "U_analytics_canonical", following: true });
      const runId = await insertRun(ctx, {
        kind: "reset",
        status: "running",
        startedAt: SCENARIO_NOW,
        runKey: "reset:staff-line-canonical",
        stage: "resetStaffs",
        stepVersion: 1,
      });
      return { runId, staffId };
    });

    await t.mutation(resetProcessPageRef, {
      runId: fixture.runId,
      kind: "reset",
      stepVersion: 1,
      stage: "resetStaffs",
    });

    const memberships = await t.run(async (ctx) =>
      (await ctx.db.query("analyticsMemberships").collect()).filter(
        (membership) => membership.role === "staff" && membership.staffId === fixture.staffId,
      ),
    );
    expect(memberships).toEqual([
      expect.objectContaining({
        membershipKey: `staff:${fixture.staffId}`,
        staffId: fixture.staffId,
        role: "staff",
        lineLinked: true,
        lineFollowing: true,
      }),
    ]);
  });

  it("reset dry-runは現在時刻を毎回評価し、enable期限切れ後はstartとともに拒否する", async () => {
    const t = convexTest(schema, modules);
    stubResetConfiguration(SCENARIO_NOW);

    expect((await t.mutation(resetDryRunRef, resetArgs())).allowed).toBe(true);
    vi.setSystemTime(SCENARIO_NOW + 1);
    const preview = await t.mutation(resetDryRunRef, resetArgs());
    expect(preview).toMatchObject({
      allowed: false,
      configured: {
        deploymentLabel: RESET_DEPLOYMENT,
        revision: RESET_REVISION,
        sourceCaptureStartAt: SOURCE_CAPTURE_START_AT,
        enabledUntil: SCENARIO_NOW,
        nightlyCronEnabled: false,
      },
    });
    await expect(t.mutation(resetStartRef, resetArgs())).rejects.toThrow("analytics_reset_guard_rejected");

    expect(await t.run(async (ctx) => await ctx.db.query("analyticsRuns").collect())).toEqual([]);
    expect(await scheduledFunctions(t)).toEqual([]);
  });

  it("resetは不正なJST日時をwriteとscheduleの前に拒否する", async () => {
    const t = convexTest(schema, modules);
    stubResetConfiguration();
    const invalid = resetArgs({ sourceCaptureStartAt: "20260229000000" });

    await expect(t.mutation(resetDryRunRef, invalid)).rejects.toThrow("analytics_source_capture_start_invalid");
    await expect(t.mutation(resetStartRef, invalid)).rejects.toThrow("analytics_source_capture_start_invalid");
    expect(await t.run(async (ctx) => await ctx.db.query("analyticsRuns").collect())).toEqual([]);
    expect(await scheduledFunctions(t)).toEqual([]);
  });

  it("reset guardはdeployment/revision/sourceCapture/versionを一致させ、一度使ったreset keyを再利用しない", async () => {
    const t = convexTest(schema, modules);
    stubResetConfiguration();

    for (const rejected of [
      resetArgs({ deploymentLabel: "prod:wrong" }),
      resetArgs({ revision: "wrong-revision" }),
      resetArgs({ sourceCaptureStartAt: "20260503000000" }),
      resetArgs({ calculationVersion: ANALYTICS_CALCULATION_VERSION + 1 }),
    ]) {
      expect((await t.mutation(resetDryRunRef, rejected)).allowed).toBe(false);
      await expect(t.mutation(resetStartRef, rejected)).rejects.toThrow("analytics_reset_guard_rejected");
    }
    expect(await t.run(async (ctx) => await ctx.db.query("analyticsRuns").collect())).toEqual([]);
    expect(await scheduledFunctions(t)).toEqual([]);

    expect((await t.mutation(resetDryRunRef, resetArgs())).allowed).toBe(true);
    const started = await t.mutation(resetStartRef, resetArgs());
    expect(started.runKey).toBe(`reset:${SOURCE_CAPTURE_START_AT}:${RESET_REVISION}`);
    expect(await scheduledFunctions(t)).toHaveLength(1);

    await t.run(async (ctx) => {
      await ctx.db.patch(started.runId, {
        status: "complete",
        terminalAt: SCENARIO_NOW + 1,
        updatedAt: SCENARIO_NOW + 1,
      });
    });
    await expect(t.mutation(resetStartRef, resetArgs())).rejects.toThrow("Analytics reset was already consumed");
    expect(await t.run(async (ctx) => await ctx.db.query("analyticsRuns").collect())).toHaveLength(1);
    expect(await scheduledFunctions(t)).toHaveLength(1);
  });

  it("新しいreset開始時だけ、12時間を超えたstale resetをfailedへ確定する", async () => {
    const t = convexTest(schema, modules);
    stubResetConfiguration();
    const staleRunId = await t.run(
      async (ctx) =>
        await insertRun(ctx, {
          kind: "reset",
          status: "running",
          startedAt: SCENARIO_NOW - 13 * HOUR_MS,
          runKey: "reset:stale-before-restart",
          stage: "resetCleanup",
        }),
    );

    const started = await t.mutation(resetStartRef, resetArgs());
    const state = await t.run(async (ctx) => ({
      stale: await ctx.db.get(staleRunId),
      current: await ctx.db.get(started.runId),
    }));

    expect(state.stale).toMatchObject({ status: "failed" });
    expect(state.current).toMatchObject({ status: "running", stage: "resetCleanup" });
    expect(await scheduledFunctions(t)).toHaveLength(1);
  });

  it("stepVersionが古いpageとfailed runのpageはwriteも次pageのscheduleもしない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const runId = await insertRun(ctx, {
        kind: "reset",
        status: "running",
        startedAt: SCENARIO_NOW,
        runKey: "reset:stale-page",
        stage: "resetCleanup",
        stepVersion: 2,
      });
      const retainedRowId = await insertAnalyticsOrganizationFixture(ctx, "stale-page-fence");
      return { runId, retainedRowId };
    });

    await t.mutation(resetProcessPageRef, {
      runId: seeded.runId,
      kind: "reset",
      stepVersion: 1,
      stage: "resetCleanup",
      substage: "analyticsOrganizations",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.runId, {
        status: "failed",
        terminalAt: SCENARIO_NOW + 1,
        updatedAt: SCENARIO_NOW + 1,
      });
    });
    await t.mutation(resetProcessPageRef, {
      runId: seeded.runId,
      kind: "reset",
      stepVersion: 2,
      stage: "resetCleanup",
      substage: "analyticsOrganizations",
    });

    const state = await t.run(async (ctx) => ({
      run: await ctx.db.get(seeded.runId),
      retainedRow: await ctx.db.get(seeded.retainedRowId),
    }));
    expect(state.run).toMatchObject({ status: "failed", stepVersion: 2, stage: "resetCleanup" });
    expect(state.retainedRow).toMatchObject({ displayName: "fixture-stale-page-fence" });
    expect(await scheduledFunctions(t)).toEqual([]);
  });

  it("processPageはstepとstageが一致しても別kindのrunを処理しない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const runId = await insertRun(ctx, {
        kind: "daily",
        status: "running",
        startedAt: SCENARIO_NOW,
        runKey: "daily:cross-kind-fence",
        stage: "resetCleanup",
        stepVersion: 2,
      });
      const retainedRowId = await insertAnalyticsOrganizationFixture(ctx, "cross-kind-fence");
      return { runId, retainedRowId };
    });

    await t.mutation(resetProcessPageRef, {
      runId: seeded.runId,
      kind: "reset",
      stepVersion: 2,
      stage: "resetCleanup",
      substage: "analyticsOrganizations",
    });

    expect(await t.run(async (ctx) => await ctx.db.get(seeded.retainedRowId))).toMatchObject({
      displayName: "fixture-cross-kind-fence",
    });
    expect(await scheduledFunctions(t)).toEqual([]);
  });

  it("reset cleanupは未知substageを先頭tableとして扱わず、削除前にrunをfailedへする", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const runId = await insertRun(ctx, {
        kind: "reset",
        status: "running",
        startedAt: SCENARIO_NOW,
        runKey: "reset:unknown-cleanup-substage",
        stage: "resetCleanup",
        stepVersion: 0,
      });
      const retainedRowId = await insertAnalyticsOrganizationFixture(ctx, "unknown-cleanup-substage");
      return { runId, retainedRowId };
    });

    await t.action(nightlyProcessStepRef, {
      runId: seeded.runId,
      kind: "reset",
      stepVersion: 0,
      stage: "resetCleanup",
      substage: "unknown-table",
    });

    expect(await t.run(async (ctx) => await ctx.db.get(seeded.retainedRowId))).toMatchObject({
      displayName: "fixture-unknown-cleanup-substage",
    });
    expect(await t.run(async (ctx) => await ctx.db.get(seeded.runId))).toMatchObject({ status: "failed" });
    expect(await scheduledFunctions(t)).toEqual([]);
  });

  it("resetはcanonical factのtenant参照を全page検証し、不整合ならcompleteにしない", async () => {
    const t = convexTest(schema, modules);
    const runId = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {
        name: "参照不整合事業者",
        isDeleted: false,
        createdAt: DATA_START_AT,
        updatedAt: DATA_START_AT,
      });
      const organizationPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "参照不整合メンバー",
        email: "broken-reference@example.com",
        emailNormalized: "broken-reference@example.com",
        status: "active",
        createdAt: DATA_START_AT,
        updatedAt: DATA_START_AT,
      });
      // 対応するanalyticsOrganizationsを欠落させ、canonical auditでfail closedにする。
      await ctx.db.insert("analyticsPeople", {
        organizationId,
        organizationPersonId,
        firstObservedAt: DATA_START_AT,
        updatedAt: DATA_START_AT,
      });
      return await insertRun(ctx, {
        kind: "reset",
        status: "running",
        startedAt: SCENARIO_NOW,
        runKey: "reset:canonical-reference-mismatch",
        stage: "resetVerify",
        stepVersion: 0,
      });
    });

    await t.action(nightlyProcessStepRef, {
      runId,
      kind: "reset",
      stepVersion: 0,
      stage: "resetVerify",
      substage: "canonical:organizations",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run(async (ctx) => await ctx.db.get(runId))).toMatchObject({
      status: "failed",
      stage: "resetVerify",
    });
  });

  it("同じsource eventを記録・再適用してもmembership intervalを二重に作らない", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", DATA_START_JST);
    const result = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "analytics_source_replay",
        shopName: "再適用検証店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        name: "再適用スタッフ",
        email: "replay@example.com",
        emailNormalized: "replay@example.com",
        isDeleted: false,
      });
      await ctx.db.insert("analyticsOrganizations", {
        organizationId: seeded.organizationId,
        displayName: "再適用検証事業者",
        registeredAt: DATA_START_AT,
        updatedAt: DATA_START_AT,
      });
      await ctx.db.insert("analyticsShops", {
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        displayName: "再適用検証店舗",
        registeredAt: DATA_START_AT,
        statusEffectiveAt: DATA_START_AT,
        cadenceConfidence: "insufficientData",
        updatedAt: DATA_START_AT,
      });
      const event = {
        eventKey: "staff:replay:absolute",
        eventType: "staffMembership.changed" as const,
        occurredAt: DATA_START_AT + 1_000,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        subjectId: staffId,
        payload: {
          kind: "staffMembership" as const,
          staffId,
          status: "active" as const,
          isShiftTarget: true,
          validFrom: DATA_START_AT + 1_000,
          lineLinked: false,
          lineFollowing: false,
        },
      };
      const beforeCaptureId = await recordAnalyticsSourceEvent(ctx, {
        ...event,
        eventKey: "staff:replay:before-capture",
        occurredAt: DATA_START_AT - 1,
      });
      const firstId = await recordAnalyticsSourceEvent(ctx, event);
      const duplicateId = await recordAnalyticsSourceEvent(ctx, event);
      if (!firstId) throw new Error("source event was not recorded");
      const sourceEvent = await ctx.db.get(firstId);
      if (!sourceEvent) throw new Error("source event was not found");
      await applySourceEvent(ctx, sourceEvent, DATA_START_AT);
      await applySourceEvent(ctx, sourceEvent, DATA_START_AT);
      const memberships = await ctx.db
        .query("analyticsMemberships")
        .withIndex("by_membershipKey_and_validFrom", (q) => q.eq("membershipKey", `staff:${staffId}`))
        .collect();
      const sourceEvents = await ctx.db
        .query("analyticsSourceEvents")
        .withIndex("by_eventKey", (q) => q.eq("eventKey", event.eventKey))
        .collect();
      return { beforeCaptureId, firstId, duplicateId, memberships, sourceEvents };
    });

    expect(result.beforeCaptureId).toBeNull();
    expect(result.duplicateId).toBe(result.firstId);
    expect(result.sourceEvents).toHaveLength(1);
    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0]).toMatchObject({
      role: "staff",
      validFrom: DATA_START_AT + 1_000,
      isShiftTarget: true,
      lineLinked: false,
      lineFollowing: false,
    });
    expect(result.memberships[0]?.validTo).toBeUndefined();
  });

  it("source eventは一件ずつ処理し、batch payloadを複数event分まとめて同じtransactionへ載せない", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", DATA_START_JST);
    const fixture = await t.run(async (ctx) => {
      const first = await seedOrganizationManagerShop(ctx, { subject: "analytics_source_page_first" });
      const second = await seedOrganizationManagerShop(ctx, { subject: "analytics_source_page_second" });
      for (const [organizationId, label] of [
        [first.organizationId, "first"],
        [second.organizationId, "second"],
      ] as const) {
        await ctx.db.insert("analyticsOrganizations", {
          organizationId,
          displayName: `before-${label}`,
          registeredAt: DATA_START_AT,
          updatedAt: DATA_START_AT,
        });
      }
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: "source-page:first",
        eventType: "organization.changed",
        occurredAt: DATA_START_AT + 1_000,
        organizationId: first.organizationId,
        payload: { kind: "organization", change: "updated", displayName: "after-first" },
      });
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: "source-page:second",
        eventType: "organization.changed",
        occurredAt: DATA_START_AT + 2_000,
        organizationId: second.organizationId,
        payload: { kind: "organization", change: "updated", displayName: "after-second" },
      });
      const runId = await insertRun(ctx, {
        kind: "daily",
        status: "running",
        targetDate: DATA_START_DATE,
        startedAt: SCENARIO_NOW,
        inputFromAt: DATA_START_AT,
        cutoffAt: DATA_START_AT + 3_000,
        stage: "sourceFacts",
        stepVersion: 0,
      });
      return { first: first.organizationId, second: second.organizationId, runId };
    });

    await t.mutation(nightlyProcessPageRef, {
      runId: fixture.runId,
      kind: "daily",
      stepVersion: 0,
      stage: "sourceFacts",
      substage: "events",
    });

    const state = await t.run(async (ctx) => {
      const organizations = await ctx.db.query("analyticsOrganizations").collect();
      return {
        first: organizations.find((row) => row.organizationId === fixture.first),
        second: organizations.find((row) => row.organizationId === fixture.second),
        run: await ctx.db.get(fixture.runId),
      };
    });
    expect(state.first?.displayName).toBe("after-first");
    expect(state.second?.displayName).toBe("before-second");
    expect(state.run).toMatchObject({ status: "running", stage: "sourceFacts", stepVersion: 1 });
  });

  it("organization削除のshopとmanagerを固定pageへ分割して収束させる", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", DATA_START_JST);
    const eventId = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "analytics_org_delete_pages" });
      await ctx.db.insert("analyticsOrganizations", {
        organizationId: seeded.organizationId,
        displayName: "削除前事業者",
        registeredAt: DATA_START_AT,
        updatedAt: DATA_START_AT,
      });
      for (let index = 0; index < ANALYTICS_POLICY.batch.cleanup + 1; index += 1) {
        const shopId =
          index === 0
            ? seeded.shopId
            : await ctx.db.insert("shops", {
                organizationId: seeded.organizationId,
                operatingStatus: "active",
                name: `削除対象店舗${index}`,
                submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
                regularClosedDays: [],
                isDeleted: false,
              });
        await ctx.db.insert("analyticsShops", {
          organizationId: seeded.organizationId,
          shopId,
          displayName: `削除対象店舗${index}`,
          registeredAt: DATA_START_AT,
          statusEffectiveAt: DATA_START_AT,
          cadenceConfidence: "insufficientData",
          updatedAt: DATA_START_AT,
        });
        const personId =
          index === 0
            ? seeded.personId
            : await ctx.db.insert("organizationPeople", {
                organizationId: seeded.organizationId,
                name: `管理者${index}`,
                email: `manager-${index}@example.com`,
                emailNormalized: `manager-${index}@example.com`,
                status: "active",
                createdAt: DATA_START_AT,
                updatedAt: DATA_START_AT,
              });
        await ctx.db.insert("analyticsMemberships", {
          membershipKey: `manager:${seeded.organizationId}:${personId}`,
          organizationId: seeded.organizationId,
          organizationPersonId: personId,
          role: "manager",
          validFrom: DATA_START_AT,
          isShiftTarget: false,
          lineLinked: false,
          lineFollowing: false,
          updatedAt: DATA_START_AT,
        });
      }
      const id = await recordAnalyticsSourceEvent(ctx, {
        eventKey: "organization:delete:paged",
        eventType: "organization.changed",
        occurredAt: DATA_START_AT + 10_000,
        organizationId: seeded.organizationId,
        payload: { kind: "organization", change: "deleted" },
      });
      if (!id) throw new Error("source event was not recorded");
      return id;
    });

    const root = await t.run(async (ctx) => {
      const event = await ctx.db.get(eventId);
      if (!event) throw new Error("source event was not found");
      return await applySourceEventPage(ctx, event, DATA_START_AT);
    });
    expect(root).toEqual({ done: false, substage: "organizationDeletionShops" });

    const firstShopPage = await t.run(async (ctx) => {
      const event = await ctx.db.get(eventId);
      if (!event || root.done) throw new Error("source continuation was not found");
      return await applySourceEventPage(ctx, event, DATA_START_AT, root.substage, root.cursor);
    });
    expect(firstShopPage).toMatchObject({ done: false, substage: "organizationDeletionShops" });
    expect(
      await t.run(
        async (ctx) =>
          (await ctx.db.query("analyticsShops").collect()).filter((shop) => shop.deletedAt !== undefined).length,
      ),
    ).toBe(ANALYTICS_POLICY.batch.cleanup);

    if (firstShopPage.done) throw new Error("shop continuation unexpectedly completed");
    const secondShopPage = await t.run(async (ctx) => {
      const event = await ctx.db.get(eventId);
      if (!event) throw new Error("source event was not found");
      return await applySourceEventPage(ctx, event, DATA_START_AT, firstShopPage.substage, firstShopPage.cursor);
    });
    expect(secondShopPage).toEqual({ done: false, substage: "organizationDeletionManagers" });
    expect(
      await t.run(
        async (ctx) =>
          (await ctx.db.query("analyticsShops").collect()).filter((shop) => shop.deletedAt !== undefined).length,
      ),
    ).toBe(ANALYTICS_POLICY.batch.cleanup + 1);

    if (secondShopPage.done) throw new Error("manager continuation was not scheduled");
    const firstManagerPage = await t.run(async (ctx) => {
      const event = await ctx.db.get(eventId);
      if (!event) throw new Error("source event was not found");
      return await applySourceEventPage(ctx, event, DATA_START_AT, secondShopPage.substage, secondShopPage.cursor);
    });
    expect(firstManagerPage).toMatchObject({ done: false, substage: "organizationDeletionManagers" });
    expect(
      await t.run(
        async (ctx) =>
          (await ctx.db.query("analyticsMemberships").collect()).filter(
            (membership) => membership.validTo !== undefined,
          ).length,
      ),
    ).toBe(ANALYTICS_POLICY.batch.cleanup);

    if (firstManagerPage.done) throw new Error("manager continuation unexpectedly completed");
    const completed = await t.run(async (ctx) => {
      const event = await ctx.db.get(eventId);
      if (!event) throw new Error("source event was not found");
      return await applySourceEventPage(ctx, event, DATA_START_AT, firstManagerPage.substage, firstManagerPage.cursor);
    });
    expect(completed).toEqual({ done: true });
    expect(
      await t.run(
        async (ctx) =>
          (await ctx.db.query("analyticsMemberships").collect()).filter(
            (membership) => membership.validTo !== undefined,
          ).length,
      ),
    ).toBe(ANALYTICS_POLICY.batch.cleanup + 1);
  });

  it("plan status deltaは配列offsetで固定pageへ分割し、50件超もsource writerをrollbackしない", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", DATA_START_JST);
    const fixture = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "analytics_plan_delta_pages" });
      await ctx.db.insert("analyticsOrganizations", {
        organizationId: seeded.organizationId,
        displayName: "プラン変更事業者",
        registeredAt: DATA_START_AT,
        updatedAt: DATA_START_AT,
      });
      await ctx.db.insert("analyticsShops", {
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        displayName: "プラン変更店舗",
        registeredAt: DATA_START_AT,
        statusEffectiveAt: DATA_START_AT,
        cadenceConfidence: "insufficientData",
        updatedAt: DATA_START_AT,
      });
      const eventId = await recordAnalyticsSourceEvent(ctx, {
        eventKey: "plan:deltas:paged",
        eventType: "plan.changed",
        occurredAt: DATA_START_AT + 10_000,
        organizationId: seeded.organizationId,
        payload: {
          kind: "plan",
          billingVersion: 1,
          effectiveAt: DATA_START_AT + 10_000,
          statusDeltas: [
            ...Array.from({ length: ANALYTICS_POLICY.batch.cleanup }, () => ({
              kind: "shop" as const,
              shopId: seeded.shopId,
              status: "archived" as const,
            })),
            { kind: "shop" as const, shopId: seeded.shopId, status: "active" as const },
          ],
        },
      });
      if (!eventId) throw new Error("source event was not recorded");
      return { eventId, shopId: seeded.shopId };
    });

    const root = await t.run(async (ctx) => {
      const event = await ctx.db.get(fixture.eventId);
      if (!event) throw new Error("source event was not found");
      return await applySourceEventPage(ctx, event, DATA_START_AT);
    });
    expect(root).toEqual({ done: false, substage: "planStatusDeltas" });
    if (root.done) throw new Error("plan continuation was not scheduled");
    const firstPage = await t.run(async (ctx) => {
      const event = await ctx.db.get(fixture.eventId);
      if (!event) throw new Error("source event was not found");
      return await applySourceEventPage(ctx, event, DATA_START_AT, root.substage, root.cursor);
    });
    expect(firstPage).toEqual({ done: false, substage: "planStatusDeltas", cursor: "50" });
    expect(
      await t.run(
        async (ctx) =>
          (
            await ctx.db
              .query("analyticsShops")
              .withIndex("by_shopId", (q) => q.eq("shopId", fixture.shopId))
              .unique()
          )?.deletedAt,
      ),
    ).toBe(DATA_START_AT + 10_000);

    if (firstPage.done) throw new Error("plan continuation unexpectedly completed");
    const completed = await t.run(async (ctx) => {
      const event = await ctx.db.get(fixture.eventId);
      if (!event) throw new Error("source event was not found");
      return await applySourceEventPage(ctx, event, DATA_START_AT, firstPage.substage, firstPage.cursor);
    });
    expect(completed).toEqual({ done: true });
    expect(
      await t.run(async (ctx) => {
        const shop = await ctx.db
          .query("analyticsShops")
          .withIndex("by_shopId", (q) => q.eq("shopId", fixture.shopId))
          .unique();
        return shop?.deletedAt === undefined;
      }),
    ).toBe(true);
  });

  it("cycle cutoff境界はvalidFromを除外し、同時刻のvalidToを含める", async () => {
    const t = convexTest(schema, modules);
    const cutoffAt = DATA_START_AT + DAY_MS;
    const result = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "analytics_cycle_boundary" });
      const includedStaffId = await ctx.db.insert("staffs", {
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        name: "終了境界スタッフ",
        email: "boundary-end@example.com",
        emailNormalized: "boundary-end@example.com",
        isDeleted: false,
      });
      const excludedStaffId = await ctx.db.insert("staffs", {
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        name: "開始境界スタッフ",
        email: "boundary-start@example.com",
        emailNormalized: "boundary-start@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2026-05-06",
        periodEnd: "2026-05-12",
        deadline: "2026-05-05",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: cutoffAt,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("analyticsMemberships", {
        membershipKey: `staff:${includedStaffId}`,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        staffId: includedStaffId,
        role: "staff",
        validFrom: cutoffAt - 1,
        validTo: cutoffAt,
        isShiftTarget: true,
        lineLinked: false,
        lineFollowing: false,
        updatedAt: cutoffAt,
      });
      await ctx.db.insert("analyticsMemberships", {
        membershipKey: `staff:${excludedStaffId}`,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        staffId: excludedStaffId,
        role: "staff",
        validFrom: cutoffAt,
        isShiftTarget: true,
        lineLinked: false,
        lineFollowing: false,
        updatedAt: cutoffAt,
      });
      const cycleId = await ctx.db.insert("analyticsShiftCycles", {
        recruitmentId,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        createdAt: DATA_START_AT + 1,
        submitDeadlineAt: cutoffAt,
        periodStart: "2026-05-06",
        periodEnd: "2026-05-12",
        confirmedAt: cutoffAt,
        closedAt: cutoffAt,
        notificationSentCount: 0,
        notificationFailedCount: 0,
        reminderSentCount: 0,
        completeness: "unavailable",
        needsFinalizationAt: cutoffAt,
        updatedAt: cutoffAt,
      });
      const cycle = await ctx.db.get(cycleId);
      if (!cycle) throw new Error("cycle was not created");
      await finalizeCycleAtCutoff(ctx, cycle, DATA_START_AT, cutoffAt);
      return {
        cycle: await ctx.db.get(cycleId),
        opportunities: await ctx.db
          .query("analyticsShiftCycleOpportunities")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
        includedStaffId,
      };
    });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({
      staffId: result.includedStaffId,
      targetedAtDeadline: true,
      targetedAtClose: true,
    });
    expect(result.cycle).toMatchObject({
      targetAtDeadline: 1,
      submittedAtDeadline: 0,
      targetAtClose: 1,
      submittedAtClose: 0,
      completeness: "complete",
    });
  });

  it("active/redacted mixed cycleは全行redactedへ単調収束し、再finalizeでも数値と行数を維持する", async () => {
    const t = convexTest(schema, modules);
    const cutoffAt = SCENARIO_NOW - 399 * DAY_MS;
    const dataStartAt = cutoffAt - DAY_MS;
    const result = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "analytics_cycle_redacted_replay" });
      const staffId = await ctx.db.insert("staffs", {
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        name: "再構築対象スタッフ",
        email: "redacted-replay@example.com",
        emailNormalized: "redacted-replay@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2025-04-01",
        periodEnd: "2025-04-07",
        deadline: "2025-03-31",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: cutoffAt,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("analyticsMemberships", {
        membershipKey: `staff:${staffId}`,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        staffId,
        role: "staff",
        validFrom: cutoffAt - 1_000,
        isShiftTarget: true,
        lineLinked: false,
        lineFollowing: false,
        updatedAt: cutoffAt,
      });
      const cycleId = await ctx.db.insert("analyticsShiftCycles", {
        recruitmentId,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        createdAt: dataStartAt + 1,
        submitDeadlineAt: cutoffAt,
        periodStart: "2025-04-01",
        periodEnd: "2025-04-07",
        confirmedAt: cutoffAt,
        closedAt: cutoffAt,
        notificationSentCount: 0,
        notificationFailedCount: 0,
        reminderSentCount: 0,
        completeness: "unavailable",
        needsFinalizationAt: cutoffAt,
        updatedAt: cutoffAt,
      });
      await ctx.db.insert("analyticsShiftCycleOpportunities", {
        recruitmentId,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        targetedAtDeadline: true,
        targetedAtClose: true,
        firstSubmittedAt: cutoffAt - 1,
        reminderCount: 0,
        completeness: "complete",
        identityState: "redacted",
        expiresAt: cutoffAt + ANALYTICS_POLICY.retention.opportunityDays * DAY_MS,
      });
      await ctx.db.insert("analyticsShiftCycleOpportunities", {
        recruitmentId,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        staffId,
        organizationPersonId: seeded.personId,
        targetedAtDeadline: true,
        targetedAtClose: false,
        reminderCount: 0,
        completeness: "complete",
        identityState: "active",
        expiresAt: cutoffAt + ANALYTICS_POLICY.retention.opportunityDays * DAY_MS,
      });
      const cycle = await ctx.db.get(cycleId);
      if (!cycle) throw new Error("cycle was not created");
      await finalizeCycleAtCutoff(ctx, cycle, dataStartAt, cutoffAt);
      const refreshed = await ctx.db.get(cycleId);
      if (!refreshed) throw new Error("cycle was not finalized");
      await finalizeCycleAtCutoff(ctx, refreshed, dataStartAt, cutoffAt);
      return {
        cycle: await ctx.db.get(cycleId),
        opportunities: await ctx.db
          .query("analyticsShiftCycleOpportunities")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      };
    });

    expect(result.opportunities).toHaveLength(2);
    expect(result.opportunities.every((opportunity) => opportunity.identityState === "redacted")).toBe(true);
    expect(result.opportunities.every((opportunity) => opportunity.staffId === undefined)).toBe(true);
    expect(result.opportunities.every((opportunity) => opportunity.organizationPersonId === undefined)).toBe(true);
    expect(
      result.opportunities.map((opportunity) => ({
        targetedAtDeadline: opportunity.targetedAtDeadline,
        targetedAtClose: opportunity.targetedAtClose,
        firstSubmittedAt: opportunity.firstSubmittedAt ?? null,
      })),
    ).toEqual([
      { targetedAtDeadline: true, targetedAtClose: true, firstSubmittedAt: cutoffAt - 1 },
      { targetedAtDeadline: true, targetedAtClose: false, firstSubmittedAt: null },
    ]);
    expect(result.cycle).toMatchObject({
      targetAtDeadline: 2,
      submittedAtDeadline: 1,
      targetAtClose: 1,
      submittedAtClose: 1,
      completeness: "complete",
    });
  });

  it("保持期限後の初回finalizeは匿名opportunityを作り、再実行でも数値factを維持する", async () => {
    const t = convexTest(schema, modules);
    const cutoffAt = SCENARIO_NOW - (ANALYTICS_POLICY.retention.opportunityDays + 1) * DAY_MS;
    const dataStartAt = cutoffAt - DAY_MS;
    const result = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "analytics_cycle_expired_first_finalize" });
      const staffId = await ctx.db.insert("staffs", {
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        name: "期限後スタッフ",
        email: "expired-first@example.com",
        emailNormalized: "expired-first@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2025-03-01",
        periodEnd: "2025-03-07",
        deadline: "2025-02-28",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: cutoffAt,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("analyticsMemberships", {
        membershipKey: `staff:${staffId}`,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        staffId,
        role: "staff",
        validFrom: cutoffAt - 1_000,
        isShiftTarget: true,
        lineLinked: false,
        lineFollowing: false,
        updatedAt: cutoffAt,
      });
      const cycleId = await ctx.db.insert("analyticsShiftCycles", {
        recruitmentId,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        createdAt: dataStartAt + 1,
        submitDeadlineAt: cutoffAt,
        periodStart: "2025-03-01",
        periodEnd: "2025-03-07",
        confirmedAt: cutoffAt,
        closedAt: cutoffAt,
        notificationSentCount: 0,
        notificationFailedCount: 0,
        reminderSentCount: 0,
        completeness: "unavailable",
        needsFinalizationAt: cutoffAt,
        updatedAt: cutoffAt,
      });
      const cycle = await ctx.db.get(cycleId);
      if (!cycle) throw new Error("cycle was not created");
      await finalizeCycleAtCutoff(ctx, cycle, dataStartAt, cutoffAt);
      const refreshed = await ctx.db.get(cycleId);
      if (!refreshed) throw new Error("cycle was not finalized");
      await finalizeCycleAtCutoff(ctx, refreshed, dataStartAt, cutoffAt);
      return {
        cycle: await ctx.db.get(cycleId),
        opportunities: await ctx.db
          .query("analyticsShiftCycleOpportunities")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      };
    });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]?.identityState).toBe("redacted");
    expect(result.opportunities[0]?.staffId).toBeUndefined();
    expect(result.cycle).toMatchObject({
      targetAtDeadline: 1,
      targetAtClose: 1,
      completeness: "complete",
    });
  });

  it("membershipと提出者の和集合がhard capを超えたcycleは部分factを保存せずfail closedする", async () => {
    const t = convexTest(schema, modules);
    const cutoffAt = DATA_START_AT + DAY_MS;
    const fixture = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "analytics_cycle_union_cap" });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2026-05-06",
        periodEnd: "2026-05-12",
        deadline: "2026-05-05",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: cutoffAt,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const cycleId = await ctx.db.insert("analyticsShiftCycles", {
        recruitmentId,
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        createdAt: DATA_START_AT + 1,
        submitDeadlineAt: cutoffAt,
        periodStart: "2026-05-06",
        periodEnd: "2026-05-12",
        confirmedAt: cutoffAt,
        closedAt: cutoffAt,
        notificationSentCount: 0,
        notificationFailedCount: 0,
        reminderSentCount: 0,
        completeness: "unavailable",
        needsFinalizationAt: cutoffAt,
        updatedAt: cutoffAt,
      });
      return { ...seeded, recruitmentId, cycleId };
    });

    const staffIds: Id<"staffs">[] = [];
    const total = ANALYTICS_POLICY.batch.scopeReadLimit + 1;
    for (let start = 0; start < total; start += 100) {
      const chunk = await t.run(async (ctx) => {
        const ids: Id<"staffs">[] = [];
        for (let index = start; index < Math.min(start + 100, total); index += 1) {
          const staffId = await ctx.db.insert("staffs", {
            organizationId: fixture.organizationId,
            shopId: fixture.shopId,
            name: `上限検証スタッフ${index}`,
            email: `union-cap-${index}@example.com`,
            emailNormalized: `union-cap-${index}@example.com`,
            isDeleted: false,
          });
          ids.push(staffId);
          if (index < ANALYTICS_POLICY.batch.scopeReadLimit) {
            await ctx.db.insert("analyticsMemberships", {
              membershipKey: `staff:${staffId}`,
              organizationId: fixture.organizationId,
              shopId: fixture.shopId,
              staffId,
              role: "staff",
              validFrom: cutoffAt - 1,
              isShiftTarget: true,
              lineLinked: false,
              lineFollowing: false,
              updatedAt: cutoffAt,
            });
          }
        }
        return ids;
      });
      staffIds.push(...chunk);
    }
    const submissionOnlyStaffId = staffIds[ANALYTICS_POLICY.batch.scopeReadLimit];
    if (!submissionOnlyStaffId) throw new Error("submission-only staff was not created");
    await t.run(async (ctx) => {
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId: fixture.recruitmentId,
        staffId: submissionOnlyStaffId,
        firstSubmittedAt: cutoffAt - 1,
        submittedAt: cutoffAt - 1,
      });
    });

    await expect(
      t.run(async (ctx) => {
        const cycle = await ctx.db.get(fixture.cycleId);
        if (!cycle) throw new Error("cycle was not created");
        await finalizeCycleAtCutoff(ctx, cycle, DATA_START_AT, cutoffAt);
      }),
    ).rejects.toThrow("analytics_cycle_opportunity_union_too_large");

    const state = await t.run(async (ctx) => ({
      cycle: await ctx.db.get(fixture.cycleId),
      opportunities: await ctx.db.query("analyticsShiftCycleOpportunities").collect(),
    }));
    expect(state.opportunities).toEqual([]);
    expect(state.cycle).toMatchObject({ completeness: "unavailable", needsFinalizationAt: cutoffAt });
    expect(state.cycle?.targetAtDeadline).toBeUndefined();
  });

  it("失敗日は再作成せず、翌日は最後のcomplete cutoffからsource eventを再適用する", async () => {
    const t = convexTest(schema, modules);
    const d0 = "2026-05-05";
    const failedDate = "2026-05-06";
    const nextDate = "2026-05-07";
    const d0Cutoff = jstDayRangeMs(d0).endMs;

    const result = await t.run(async (ctx) => {
      await insertRun(ctx, {
        kind: "reset",
        status: "complete",
        startedAt: SCENARIO_NOW - 10_000,
        runKey: "reset:complete",
        cutoffAt: SOURCE_CAPTURE_START_AT,
      });
      await insertRun(ctx, {
        kind: "daily",
        status: "complete",
        targetDate: d0,
        startedAt: SCENARIO_NOW - 8_000,
        inputFromAt: SOURCE_CAPTURE_START_AT,
        cutoffAt: d0Cutoff,
      });
      await insertRun(ctx, {
        kind: "daily",
        status: "failed",
        targetDate: failedDate,
        startedAt: SCENARIO_NOW - 6_000,
        inputFromAt: d0Cutoff,
      });

      const retry = await createDailyRun(ctx, failedDate, SCENARIO_NOW);
      const next = await createDailyRun(ctx, nextDate, SCENARIO_NOW);
      const failedRuns = await ctx.db
        .query("analyticsRuns")
        .withIndex("by_kind_and_status_and_targetDate", (q) =>
          q.eq("kind", "daily").eq("status", "failed").eq("targetDate", failedDate),
        )
        .collect();
      return { retry, next, failedRuns };
    });

    expect(result.retry).toBeNull();
    expect(result.failedRuns).toHaveLength(1);
    expect(result.next).toMatchObject({
      runKey: `daily:${nextDate}`,
      status: "running",
      targetDate: nextDate,
      inputFromAt: d0Cutoff,
      cutoffAt: jstDayRangeMs(nextDate).endMs,
      stage: "sourceFacts",
      stepVersion: 0,
    });
  });

  it("通常dailyは終了済みの日を日末cutoffで一度だけ作り、当日と未来日を拒否する", async () => {
    const t = convexTest(schema, modules);
    const targetDate = "2026-05-09";
    await t.run(async (ctx) => {
      await insertRun(ctx, {
        kind: "reset",
        status: "complete",
        startedAt: SCENARIO_NOW - DAY_MS,
        runKey: "reset:normal-daily-boundary",
        cutoffAt: SOURCE_CAPTURE_START_AT,
      });
    });

    const first = await t.run(async (ctx) => await createDailyRun(ctx, targetDate, SCENARIO_NOW));
    expect(first).toMatchObject({
      runKey: `daily:${targetDate}`,
      status: "running",
      dataStartDate: DATA_START_DATE,
      targetDate,
      inputFromAt: SOURCE_CAPTURE_START_AT,
      cutoffAt: jstDayRangeMs(targetDate).endMs,
    });
    if (!first) throw new Error("normal daily run was not created");
    await t.run(async (ctx) => {
      await ctx.db.patch(first._id, {
        status: "complete",
        terminalAt: SCENARIO_NOW,
        updatedAt: SCENARIO_NOW,
      });
    });

    await expect(t.run(async (ctx) => await createDailyRun(ctx, targetDate, SCENARIO_NOW))).resolves.toBeNull();
    for (const rejectedDate of ["2026-05-10", "2026-05-11"]) {
      await expect(t.run(async (ctx) => await createDailyRun(ctx, rejectedDate, SCENARIO_NOW))).rejects.toThrow(
        "Invalid analytics target date",
      );
    }
    const dailyRuns = await t.run(async (ctx) =>
      (await ctx.db.query("analyticsRuns").collect())
        .filter((run) => run.kind === "daily")
        .map((run) => ({ runKey: run.runKey, targetDate: run.targetDate, cutoffAt: run.cutoffAt })),
    );
    expect(dailyRuns).toEqual([
      { runKey: `daily:${targetDate}`, targetDate, cutoffAt: jstDayRangeMs(targetDate).endMs },
    ]);
  });

  it.each(["invalidRate", "rollupMismatch"] as const)(
    "publish invariantは%sを検知し、runをcompleteにしない",
    async (failureKind) => {
      const t = convexTest(schema, modules);
      const targetDate = "2026-05-06";
      const runId = await t.run(async (ctx) => {
        const id = await insertRun(ctx, {
          kind: "daily",
          status: "running",
          targetDate,
          startedAt: SCENARIO_NOW,
          stage: "publish",
          stepVersion: 6,
        });
        const serviceId = await insertServiceKpi(ctx, {
          runId: id,
          snapshotDate: targetDate,
          organizationCount: failureKind === "rollupMismatch" ? 1 : 0,
        });
        if (failureKind === "invalidRate") {
          await ctx.db.patch(serviceId, { northStar: { numerator: 1, denominator: 0 } });
        }
        return id;
      });

      await t.action(nightlyProcessStepRef, {
        runId,
        kind: "daily",
        stepVersion: 6,
        stage: "publish",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const run = await t.run(async (ctx) => await ctx.db.get(runId));
      expect(run).toMatchObject({
        status: "failed",
        stage: "publish",
        stepVersion: failureKind === "rollupMismatch" ? 7 : 6,
      });
      const overview = await getOverview(t, targetDate);
      expect(overview).toMatchObject({ metadata: { availability: "unavailable" }, current: null });
    },
  );

  it("未知のerror messageを固定codeへredactし、構造化logへ原文を含めない", () => {
    const sensitiveMessage = "provider failed for staff@example.com with secret-token";
    const errorCode = safeAnalyticsErrorCode(new Error(sensitiveMessage));
    const log = formatAnalyticsLog({
      event: "analytics_run_failed",
      kind: "daily",
      runId: "analytics-run-with-sensitive-prefix-123456789012",
      targetDate: "2026-05-06",
      stage: "publish",
      step: 6,
      errorCode,
    });

    expect(errorCode).toBe("analytics_unexpected");
    expect(log).not.toContain(sensitiveMessage);
    expect(JSON.parse(log)).toEqual({
      event: "analytics_run_failed",
      kind: "daily",
      runId: "123456789012",
      targetDate: "2026-05-06",
      stage: "publish",
      step: 6,
      errorCode: "analytics_unexpected",
    });
    expect(
      safeAnalyticsErrorCode(
        new Error("[CONVEX M(analytics/nightly:processPage)] Server Error: analytics_run_invariant_failed"),
      ),
    ).toBe("analytics_run_invariant_failed");
    expect(safeAnalyticsErrorCode(new Error("analytics_cycle_opportunity_union_too_large"))).toBe(
      "analytics_cycle_opportunity_union_too_large",
    );
  });
});

describe("Analytics availability and publication fence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["running", "failed"] as const)("最新resetが%sなら以前のcomplete snapshotを返さない", async (resetStatus) => {
    const t = convexTest(schema, modules);
    const snapshotDate = "2026-05-06";
    await t.run(async (ctx) => {
      const completeRunId = await insertRun(ctx, {
        kind: "daily",
        status: "complete",
        targetDate: snapshotDate,
        startedAt: SCENARIO_NOW - 3_000,
      });
      await insertServiceKpi(ctx, { runId: completeRunId, snapshotDate, organizationCount: 1 });
      await insertRun(ctx, {
        kind: "reset",
        status: resetStatus,
        startedAt: SCENARIO_NOW - 1_000,
        runKey: `reset:${resetStatus}`,
      });
    });

    const overview = await getOverview(t, snapshotDate);
    expect(overview).toMatchObject({
      metadata: {
        availability: "unavailable",
        asOf: null,
        latestCompleteSnapshotDate: null,
      },
      current: null,
    });
    expect(overview?.metadata.warnings).toContain(
      resetStatus === "running" ? "分析データの再構築を実行中です" : "分析データの再構築に失敗しています",
    );
  });

  it("最新dailyがfailedなら、古いcomplete runの行を公開しない", async () => {
    const t = convexTest(schema, modules);
    const completeDate = "2026-05-06";
    await t.run(async (ctx) => {
      await insertRun(ctx, {
        kind: "reset",
        status: "complete",
        startedAt: SCENARIO_NOW - 5_000,
        runKey: "reset:baseline",
      });
      const completeRunId = await insertRun(ctx, {
        kind: "daily",
        status: "complete",
        targetDate: completeDate,
        startedAt: SCENARIO_NOW - 3_000,
      });
      await insertServiceKpi(ctx, { runId: completeRunId, snapshotDate: completeDate, organizationCount: 1 });
      await insertRun(ctx, {
        kind: "daily",
        status: "failed",
        targetDate: "2026-05-07",
        startedAt: SCENARIO_NOW - 1_000,
      });
    });

    const overview = await getOverview(t, completeDate);
    expect(overview).toMatchObject({
      metadata: { availability: "unavailable", latestCompleteSnapshotDate: completeDate },
      current: null,
    });
    expect(overview?.metadata.warnings).toContain("最新の日次集計に失敗しています");
  });

  it("失敗日の穴を埋めず、翌日のmatching runIdだけを公開する", async () => {
    const t = convexTest(schema, modules);
    const failedDate = "2026-05-06";
    const completeDate = "2026-05-07";
    await t.run(async (ctx) => {
      await insertRun(ctx, {
        kind: "reset",
        status: "complete",
        startedAt: SCENARIO_NOW - 8_000,
        runKey: "reset:baseline",
      });
      const failedRunId = await insertRun(ctx, {
        kind: "daily",
        status: "failed",
        targetDate: failedDate,
        startedAt: SCENARIO_NOW - 6_000,
      });
      const completeRunId = await insertRun(ctx, {
        kind: "daily",
        status: "complete",
        targetDate: completeDate,
        startedAt: SCENARIO_NOW - 4_000,
      });
      await insertServiceKpi(ctx, { runId: failedRunId, snapshotDate: completeDate, organizationCount: 999 });
      await insertServiceKpi(ctx, { runId: completeRunId, snapshotDate: completeDate, organizationCount: 2 });
    });

    const rangeWithGap = await getOverview(t, failedDate, completeDate);
    expect(rangeWithGap).toMatchObject({
      metadata: { availability: "unavailable", latestCompleteSnapshotDate: completeDate },
      current: null,
    });
    expect(rangeWithGap?.metadata.warnings).toContain("選択期間に欠損日があります（1日、最初: 2026-05-06）");

    const completeOnly = await getOverview(t, completeDate);
    expect(completeOnly).toMatchObject({
      metadata: {
        availability: "available",
        latestCompleteSnapshotDate: completeDate,
        asOf: jstDayRangeMs(completeDate).endMs,
      },
      current: { counts: { organizationCount: 2 } },
    });
  });

  it.each([
    {
      caseName: "データ蓄積開始日前",
      comparisonDate: "2026-05-04",
      warning: "データ蓄積開始日より前の期間は値がありません",
    },
    {
      caseName: "欠損日",
      comparisonDate: "2026-05-06",
      warning: "選択期間に欠損日があります（1日、最初: 2026-05-06）",
    },
  ])("比較期間が$caseNameでも完全なcurrentを公開する", async ({ comparisonDate, warning }) => {
    const t = convexTest(schema, modules);
    const currentDate = "2026-05-07";
    await t.run(async (ctx) => {
      await insertRun(ctx, {
        kind: "reset",
        status: "complete",
        startedAt: SCENARIO_NOW - 8_000,
        runKey: `reset:comparison-${comparisonDate}`,
      });
      const currentRunId = await insertRun(ctx, {
        kind: "daily",
        status: "complete",
        targetDate: currentDate,
        startedAt: SCENARIO_NOW - 4_000,
      });
      await insertServiceKpi(ctx, { runId: currentRunId, snapshotDate: currentDate, organizationCount: 2 });
    });

    const overview = await getOverview(t, currentDate, currentDate, {
      from: comparisonDate,
      to: comparisonDate,
    });

    expect(overview).toMatchObject({
      metadata: { availability: "available", latestCompleteSnapshotDate: currentDate },
      current: { snapshotDate: currentDate, counts: { organizationCount: 2 } },
      comparison: null,
    });
    expect(overview?.metadata.warnings).toContain(warning);
  });

  it("切替前店舗をmilestone到達率の分母へ含めない", async () => {
    const t = convexTest(schema, modules);
    const snapshotDate = "2026-05-07";
    await t.run(async (ctx) => {
      await insertRun(ctx, {
        kind: "reset",
        status: "complete",
        startedAt: SCENARIO_NOW - 8_000,
        runKey: "reset:milestone-baseline",
      });
      const runId = await insertRun(ctx, {
        kind: "daily",
        status: "complete",
        targetDate: snapshotDate,
        startedAt: SCENARIO_NOW - 4_000,
      });
      const serviceId = await insertServiceKpi(ctx, { runId, snapshotDate, organizationCount: 1 });
      await ctx.db.patch(serviceId, {
        shopCount: 2,
        kpiEligibleShopCount: 1,
        milestoneCounts: {
          registered: 1,
          firstRecruitment: 1,
          firstSubmission: 0,
          firstConfirmed: 0,
          secondConfirmed: 0,
        },
      });
    });

    const milestones = await t.query(internal.analyticsDashboard.queries.getMilestones, {
      from: snapshotDate,
      to: snapshotDate,
      granularity: "day",
      organizationId: null,
      shopId: null,
    });

    expect(milestones).toMatchObject({
      metadata: { availability: "available" },
      currentRates: {
        registered: { reach: { numerator: 1, denominator: 1, rate: 1 } },
        firstRecruitment: { reach: { numerator: 1, denominator: 1, rate: 1 } },
      },
    });
  });

  it("detail期間を25か月の保持下限へ丸め、選択終了日のcomplete runを解決する", async () => {
    vi.setSystemTime(new Date("2028-07-10T00:00:00+09:00"));
    const t = convexTest(schema, modules);
    const beforeRetention = "2026-06-09";
    const retentionStart = "2026-06-10";
    const laterDate = "2028-07-10";

    const result = await t.run(async (ctx) => {
      await insertRun(ctx, {
        kind: "reset",
        status: "complete",
        startedAt: SCENARIO_NOW - 8_000,
        runKey: "reset:detail-retention",
      });
      await insertRun(ctx, {
        kind: "daily",
        status: "complete",
        targetDate: beforeRetention,
        startedAt: SCENARIO_NOW - 6_000,
      });
      const selectedRunId = await insertRun(ctx, {
        kind: "daily",
        status: "complete",
        targetDate: retentionStart,
        startedAt: SCENARIO_NOW - 4_000,
      });
      await insertRun(ctx, {
        kind: "daily",
        status: "complete",
        targetDate: laterDate,
        startedAt: SCENARIO_NOW - 2_000,
      });
      const state = await getAnalyticsReadState(ctx);
      const range = await getCompleteRunRange(
        ctx,
        state,
        { from: beforeRetention, to: retentionStart },
        { detailRetention: true },
      );
      return {
        range: {
          effectiveFrom: range.effectiveFrom,
          effectiveTo: range.effectiveTo,
          retentionStartDate: range.retentionStartDate,
          missingDates: range.missingDates,
          latestCompleteRun: range.latestCompleteRun,
        },
        selectedRunId,
      };
    });

    expect(result.range).toMatchObject({
      effectiveFrom: retentionStart,
      effectiveTo: retentionStart,
      retentionStartDate: retentionStart,
      missingDates: [],
      latestCompleteRun: { _id: result.selectedRunId, targetDate: retentionStart },
    });
  });
});
