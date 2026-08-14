import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getDeadlineCutoff } from "../_lib/dateFormat";
import {
  seedActionInboxSources,
  seedAdditionalActiveManager,
  seedNotificationFailure,
  seedPendingRegistrationRequests,
} from "../_test/actionInboxFixtures";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { DASHBOARD_RESPONSE_COUNT_LIMIT } from "../constants";

const NOW = Date.parse("2026-08-14T00:00:00Z");

describe("appOrganization/actionInboxQueries.getActionInbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  it("canonical organization actorだけを許可し、別組織のshop filterを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedActionInboxSources(ctx, { subject: "action_scope_actor", now: NOW });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "action_scope_other",
        shopName: "別組織店舗",
        complimentary: true,
      });
      return { actor, other };
    });
    const actor = t.withIdentity({ subject: "action_scope_actor" });

    await expect(
      t.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.actor.organizationId,
        shopFilter: "all",
        refreshBucket: 0,
      }),
    ).rejects.toThrowError("Not found");
    await expect(
      actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.other.organizationId,
        shopFilter: "all",
        refreshBucket: 0,
      }),
    ).rejects.toThrowError("Not found");
    await expect(
      actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.actor.organizationId,
        shopFilter: ids.other.shopId,
        refreshBucket: 0,
      }),
    ).rejects.toThrowError("Not found");

    const filtered = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.actor.organizationId,
      shopFilter: ids.actor.shopId,
      refreshBucket: 0,
    });
    expect(filtered.items.map(({ kind }) => kind)).toEqual(["shift", "staffRegistration", "notificationFailure"]);
    expect(filtered.items.every(({ scope }) => scope.kind === "shop" && scope.shopId === ids.actor.shopId)).toBe(true);
  });

  it("readOnly actorには一覧を返すが、write capabilityをすべて閉じる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedActionInboxSources(ctx, { subject: "action_read_only", now: NOW });
      await seedAdditionalActiveManager(ctx, {
        organizationId: base.organizationId,
        subject: "action_read_only_active_manager",
        now: NOW,
      });
      await ctx.db.patch(base.memberId, { status: "readOnly", updatedAt: NOW });
      return base;
    });

    const result = await t
      .withIdentity({ subject: "action_read_only" })
      .query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: "all",
        refreshBucket: 0,
      });

    expect(result.items.map(({ kind }) => kind)).toEqual([
      "shift",
      "staffRegistration",
      "notificationFailure",
      "managerInvitation",
    ]);
    expect(result.items.find((item) => item.kind === "staffRegistration")).toMatchObject({
      canApprove: false,
      canReject: false,
    });
    expect(result.items.find((item) => item.kind === "notificationFailure")).toMatchObject({
      canRetry: false,
      canResolve: false,
    });
    expect(result.items.find((item) => item.kind === "managerInvitation")).toMatchObject({
      canResend: false,
      canRevoke: false,
    });
  });

  it("source上限を超える登録申請へ、拒否されないcontinuationだけで重複なく到達する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "action_registration_pagination",
        complimentary: true,
      });
      const requestIds = await seedPendingRegistrationRequests(ctx, {
        shopId: base.shopId,
        count: 113,
        createdAt: NOW - 10_000,
      });
      return { ...base, requestIds };
    });
    const actor = t.withIdentity({ subject: "action_registration_pagination" });
    const found: Id<"staffRegistrationRequests">[] = [];
    let page = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });

    for (let pageNumber = 0; pageNumber < 30; pageNumber += 1) {
      found.push(...page.items.filter((item) => item.kind === "staffRegistration").map((item) => item.requestId));
      const cursor = page.continuationByKind.staffRegistration;
      if (!cursor) break;
      expect(page.hasMoreByKind.staffRegistration).toBe(true);
      page = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: "all",
        refreshBucket: pageNumber + 1,
        loadMore: { kind: "staffRegistration", cursor },
      });
    }

    expect(found).toHaveLength(113);
    expect(new Set(found).size).toBe(113);
    expect([...found].sort()).toEqual([...ids.requestIds].sort());
    expect(page.continuationByKind).toEqual({});
    expect(page.hasMoreByKind).toEqual({});
  });

  it("scan上限より前に非対応failureが続いても、empty continuationから可視failureへ到達する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "action_failure_filter_pagination",
        complimentary: true,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: base.shopId,
        organizationId: base.organizationId,
        name: "可視failure対象",
        email: "visible-failure@example.com",
        emailNormalized: "visible-failure@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      const visibleFailureId = await seedNotificationFailure(ctx, {
        shopId: base.shopId,
        staffId,
        failureKey: "visible-after-hidden-cap",
        context: "line.sendInviteEmail",
        lastFailedAt: NOW - 1_000,
      });
      for (let index = 0; index < 205; index += 1) {
        await seedNotificationFailure(ctx, {
          shopId: base.shopId,
          failureKey: `hidden-${index}`,
          context: "non.actionable.context",
          lastFailedAt: NOW + index + 1,
        });
      }
      return { ...base, visibleFailureId };
    });
    const actor = t.withIdentity({ subject: "action_failure_filter_pagination" });
    const found: Id<"notificationFailureInbox">[] = [];
    let sawEmptyContinuation = false;
    let page = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });

    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const failures = page.items.filter((item) => item.kind === "notificationFailure").map((item) => item.failureId);
      found.push(...failures);
      const cursor = page.continuationByKind.notificationFailure;
      if (!cursor) break;
      if (failures.length === 0) sawEmptyContinuation = true;
      expect(page.hasMoreByKind.notificationFailure).toBe(true);
      page = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: "all",
        refreshBucket: pageNumber + 1,
        loadMore: { kind: "notificationFailure", cursor },
      });
    }

    expect(sawEmptyContinuation).toBe(true);
    expect(found).toEqual([ids.visibleFailureId]);
    expect(page.continuationByKind).toEqual({});
  });

  it("終了済みshiftがscan上限を埋めても、empty continuationから後続の要対応shiftへ到達する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "action_shift_filter_pagination",
        complimentary: true,
      });
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("recruitments", {
          shopId: base.shopId,
          periodStart: "2026-01-01",
          periodEnd: "2026-01-02",
          deadline: "2026-01-01",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      }
      const visibleRecruitmentId = await ctx.db.insert("recruitments", {
        shopId: base.shopId,
        periodStart: "2026-08-15",
        periodEnd: "2026-08-20",
        deadline: "2026-08-13",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { ...base, visibleRecruitmentId };
    });
    const actor = t.withIdentity({ subject: "action_shift_filter_pagination" });
    const found: Id<"recruitments">[] = [];
    let sawEmptyContinuation = false;
    let page = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });

    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const shifts = page.items.filter((item) => item.kind === "shift").map((item) => item.recruitmentId);
      found.push(...shifts);
      const cursor = page.continuationByKind.shift;
      if (!cursor) break;
      if (shifts.length === 0) sawEmptyContinuation = true;
      page = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: "all",
        refreshBucket: pageNumber + 1,
        loadMore: { kind: "shift", cursor },
      });
    }

    expect(sawEmptyContinuation).toBe(true);
    expect(found).toEqual([ids.visibleRecruitmentId]);
    expect(page.continuationByKind).toEqual({});
  });

  it("continuationを別organization・filter・kind・店舗snapshotへ再利用できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "action_cursor_scope",
        complimentary: true,
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: base.organizationId,
        operatingStatus: "active",
        name: "追加店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      await seedPendingRegistrationRequests(ctx, { shopId: base.shopId, count: 9, createdAt: NOW });
      const other = await seedOrganizationManagerShop(ctx, {
        subject: "action_cursor_scope_other",
        complimentary: true,
      });
      return { ...base, secondShopId, other };
    });
    const actor = t.withIdentity({ subject: "action_cursor_scope" });
    const first = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });
    const cursor = first.continuationByKind.staffRegistration;
    if (!cursor) throw new Error("staff registration continuation was not returned");

    await expect(
      actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: ids.shopId,
        refreshBucket: 1,
        loadMore: { kind: "staffRegistration", cursor },
      }),
    ).rejects.toThrowError("Invalid continuation cursor");
    await expect(
      actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: "all",
        refreshBucket: 1,
        loadMore: { kind: "notificationFailure", cursor },
      }),
    ).rejects.toThrowError("Invalid continuation cursor");
    await expect(
      t
        .withIdentity({ subject: "action_cursor_scope_other" })
        .query(api.appOrganization.actionInboxQueries.getActionInbox, {
          organizationId: ids.other.organizationId,
          shopFilter: "all",
          refreshBucket: 1,
          loadMore: { kind: "staffRegistration", cursor },
        }),
    ).rejects.toThrowError("Invalid continuation cursor");

    const tamperedPayload = JSON.parse(cursor) as Record<string, unknown>;
    tamperedPayload.sourceCursor = JSON.stringify({
      kind: "staffRegistration",
      documentId: "forged-document-id",
      creationTime: 0,
    });
    await expect(
      actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: "all",
        refreshBucket: 2,
        loadMore: { kind: "staffRegistration", cursor: JSON.stringify(tamperedPayload) },
      }),
    ).rejects.toThrowError("Invalid continuation cursor");

    await t.run(async (ctx) => await ctx.db.patch(ids.secondShopId, { operatingStatus: "archived" }));
    await expect(
      actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: "all",
        refreshBucket: 2,
        loadMore: { kind: "staffRegistration", cursor },
      }),
    ).rejects.toThrowError("Invalid continuation cursor");
  });

  it("シフト母数の安全上限超過を下限値として示し、他の対応項目を維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedActionInboxSources(ctx, {
        subject: "action_staff_count_limit",
        now: NOW,
      });
      for (let index = 1; index < DASHBOARD_RESPONSE_COUNT_LIMIT; index += 1) {
        const email = `bounded-staff-${index}@example.com`;
        await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          name: `上限スタッフ${index}`,
          email,
          emailNormalized: email,
          excludedFromShift: false,
          isDeleted: false,
        });
      }
      return base;
    });
    const actor = t.withIdentity({ subject: "action_staff_count_limit" });

    const atLimit = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });
    expect(atLimit.items.find((item) => item.kind === "shift")).toMatchObject({
      totalStaffCount: DASHBOARD_RESPONSE_COUNT_LIMIT,
      totalStaffCountHasOverflow: false,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("staffs", {
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        name: "上限超過スタッフ",
        email: "over-limit-staff@example.com",
        emailNormalized: "over-limit-staff@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
    });
    const overLimit = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 1,
    });
    expect(overLimit.items.map(({ kind }) => kind)).toEqual([
      "shift",
      "staffRegistration",
      "notificationFailure",
      "managerInvitation",
    ]);
    expect(overLimit.items.find((item) => item.kind === "shift")).toMatchObject({
      totalStaffCount: DASHBOARD_RESPONSE_COUNT_LIMIT,
      totalStaffCountHasOverflow: true,
    });
  });

  it("管理者招待はcanonical上限5件をすべて返し、hasMoreを誤って広告しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "action_manager_invitation_limit",
        complimentary: true,
      });
      const invitationIds: Id<"organizationInvitations">[] = [];
      for (let index = 0; index < 5; index += 1) {
        const email = `manager-limit-${index}@example.com`;
        invitationIds.push(
          await ctx.db.insert("organizationInvitations", {
            organizationId: base.organizationId,
            email,
            emailNormalized: email,
            invitedName: `上限招待${index}`,
            tokenDigest: `manager-limit-token-${index}`,
            status: "issued",
            purpose: "managerAddition",
            inviterMemberId: base.memberId,
            reservedSeat: true,
            version: 1,
            expiresAt: NOW + (index + 1) * 60_000,
            createdAt: NOW - index,
            updatedAt: NOW - index,
          }),
        );
      }
      return { ...base, invitationIds };
    });
    const actor = t.withIdentity({ subject: "action_manager_invitation_limit" });

    const result = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });
    expect(result.items.filter((item) => item.kind === "managerInvitation").map((item) => item.invitationId)).toEqual(
      [...ids.invitationIds].reverse(),
    );
    expect(result.continuationByKind.managerInvitation).toBeUndefined();
    expect(result.hasMoreByKind.managerInvitation).toBeUndefined();
  });

  it("締切直前はnextRefreshAtを返し、同時刻にshiftを追加し、期間終了同時刻に除外する", async () => {
    const deadline = "2026-08-14";
    const periodEnd = "2026-08-16";
    const deadlineCutoff = getDeadlineCutoff(deadline);
    const periodEndCutoff = getDeadlineCutoff(periodEnd);
    vi.setSystemTime(deadlineCutoff - 1);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "action_deadline_boundary",
        complimentary: true,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: base.shopId,
        periodStart: "2026-08-15",
        periodEnd,
        deadline,
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { ...base, recruitmentId };
    });
    const actor = t.withIdentity({ subject: "action_deadline_boundary" });

    const before = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });
    expect(before.items.filter(({ kind }) => kind === "shift")).toEqual([]);
    expect(before.nextRefreshAt).toBe(deadlineCutoff);

    vi.setSystemTime(deadlineCutoff);
    const atDeadline = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 1,
    });
    expect(atDeadline.items.filter(({ kind }) => kind === "shift")).toEqual([
      expect.objectContaining({ recruitmentId: ids.recruitmentId }),
    ]);
    expect(atDeadline.nextRefreshAt).toBe(periodEndCutoff);

    vi.setSystemTime(periodEndCutoff);
    const atPeriodEnd = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 2,
    });
    expect(atPeriodEnd.items.filter(({ kind }) => kind === "shift")).toEqual([]);
    expect(atPeriodEnd.nextRefreshAt).toBeUndefined();
  });
});
