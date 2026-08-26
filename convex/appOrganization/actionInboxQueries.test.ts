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
import { seedOrganizationManagerShop, seedOrganizationPersonLineLink } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { DASHBOARD_RESPONSE_COUNT_LIMIT } from "../constants";

const NOW = Date.parse("2026-08-14T00:00:00Z");

describe("appOrganization/actionInboxQueries.getActionInbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

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

  it("旧形式のstatus未設定店舗を稼働中として扱い、削除済みactive履歴を走査上限へ含めない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedActionInboxSources(ctx, { subject: "action_legacy_active_shop", now: NOW });
      await ctx.db.patch(base.shopId, { operatingStatus: undefined });
      for (let index = 0; index < 51; index += 1) {
        await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: `削除済み店舗履歴${index}`,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: true,
        });
      }
      return base;
    });
    const actor = t.withIdentity({ subject: "action_legacy_active_shop" });

    const all = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });
    const filtered = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: ids.shopId,
      refreshBucket: 0,
    });

    expect(all.items.map(({ kind }) => kind)).toEqual([
      "shift",
      "staffRegistration",
      "notificationFailure",
      "managerInvitation",
    ]);
    expect(filtered.items.map(({ kind }) => kind)).toEqual(["shift", "staffRegistration", "notificationFailure"]);
  });

  it("上限超過では通常操作を閉じ、管理者招待の取消だけを維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedActionInboxSources(ctx, { subject: "action_over_limit", now: NOW });
      for (let index = 0; index < 5; index += 1) {
        await seedAdditionalActiveManager(ctx, {
          organizationId: base.organizationId,
          subject: `action_over_limit_manager_${index}`,
          now: NOW,
        });
      }
      return base;
    });

    const result = await t
      .withIdentity({ subject: "action_over_limit" })
      .query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: "all",
        refreshBucket: 0,
      });

    expect(result.items.find((item) => item.kind === "staffRegistration")).toMatchObject({
      canApprove: false,
      approveDisabledReason: "現在の利用状態では承認できません。",
      canReject: true,
    });
    expect(result.items.find((item) => item.kind === "notificationFailure")).toMatchObject({
      canRetry: false,
      canResolve: true,
    });
    expect(result.items.find((item) => item.kind === "managerInvitation")).toMatchObject({
      canResend: false,
      canRevoke: true,
    });
  });

  it("101件の人物で利用数を安全に確定できなくてもall一覧と整理操作を維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedActionInboxSources(ctx, { subject: "action_usage_unknown", now: NOW });
      for (let index = 0; index < 100; index += 1) {
        const email = `action-usage-unknown-${index}@example.com`;
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: `利用状態未確定人物${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: NOW,
          updatedAt: NOW,
        });
      }
      return base;
    });

    const result = await t
      .withIdentity({ subject: "action_usage_unknown" })
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
      approveDisabledReason: "現在の利用状態では承認できません。",
      canReject: true,
    });
    expect(result.items.find((item) => item.kind === "notificationFailure")).toMatchObject({
      canRetry: false,
      canResolve: true,
    });
    expect(result.items.find((item) => item.kind === "managerInvitation")).toMatchObject({
      canResend: false,
      canRevoke: true,
    });
  });

  it("billing rowがない移行中組織は従来どおり通常操作を表示する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedActionInboxSources(ctx, { subject: "action_missing_billing", now: NOW });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state fixture was not found");
      await ctx.db.delete(billingState._id);
      return base;
    });

    const result = await t
      .withIdentity({ subject: "action_missing_billing" })
      .query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: ids.shopId,
        refreshBucket: 0,
      });

    expect(result.items.find((item) => item.kind === "staffRegistration")).toMatchObject({
      canApprove: true,
      approveDisabledReason: null,
      canReject: true,
    });
    expect(result.items.find((item) => item.kind === "notificationFailure")).toMatchObject({
      canRetry: true,
      canResolve: true,
    });
  });

  it("登録申請の承認可否と理由をDashboardと同じ判定で返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "action_registration_approval_availability",
        complimentary: true,
      });
      const now = Date.now();
      const requests = [
        { name: "安全な削除済み人物", email: "action-safe-removed@example.com", activeLine: false },
        { name: "LINE状態不整合の削除済み人物", email: "action-unsafe-removed@example.com", activeLine: true },
      ];
      for (const request of requests) {
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: request.name,
          email: request.email,
          emailNormalized: request.email,
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        if (request.activeLine) {
          await seedOrganizationPersonLineLink(ctx, {
            organizationId: base.organizationId,
            organizationPersonId: personId,
            lineUserId: "U_action_unsafe_removed",
          });
        }
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: base.shopId,
          name: request.name,
          email: request.email,
          emailNormalized: request.email,
          status: "pending",
          termsConsentVersion: "terms-consent",
          privacyConsentVersion: "privacy-consent",
          termsDocumentVersion: "terms-document",
          privacyDocumentVersion: "privacy-document",
          consentedAt: now,
          createdAt: now,
        });
      }
      return base;
    });
    const actor = t.withIdentity({ subject: "action_registration_approval_availability" });

    const inbox = await actor.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: ids.shopId,
      refreshBucket: 0,
    });
    const dashboard = await actor.query(api.staffRegistration.queries.getPendingRequests, { shopId: ids.shopId });
    const inboxEligibility = inbox.items
      .filter((item) => item.kind === "staffRegistration")
      .map(({ requestId, applicantName, canApprove, approveDisabledReason }) => ({
        requestId,
        name: applicantName,
        canApprove,
        approveDisabledReason,
      }))
      .sort((left, right) => left.requestId.localeCompare(right.requestId));
    const dashboardEligibility = dashboard
      .map(({ _id, name, canApprove, approveDisabledReason }) => ({
        requestId: _id,
        name,
        canApprove,
        approveDisabledReason,
      }))
      .sort((left, right) => left.requestId.localeCompare(right.requestId));

    expect(inboxEligibility).toEqual(dashboardEligibility);
    expect(inboxEligibility).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "安全な削除済み人物",
          canApprove: true,
          approveDisabledReason: null,
        }),
        expect.objectContaining({
          name: "LINE状態不整合の削除済み人物",
          canApprove: false,
          approveDisabledReason: "この申請は現在承認できません。不要な申請は却下できます。",
        }),
      ]),
    );
  });

  it("残存招待の再送と取消の操作可否を返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedActionInboxSources(ctx, { subject: "action_manager_invitation_closed", now: NOW }),
    );

    const result = await t
      .withIdentity({ subject: "action_manager_invitation_closed" })
      .query(api.appOrganization.actionInboxQueries.getActionInbox, {
        organizationId: ids.organizationId,
        shopFilter: "all",
        refreshBucket: 0,
      });

    expect(
      result.items
        .filter((item) => item.kind === "managerInvitation")
        .map(({ invitationId, canResend, canRevoke }) => ({ invitationId, canResend, canRevoke })),
    ).toEqual([{ invitationId: ids.invitationId, canResend: true, canRevoke: true }]);
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

  it("提出期限直前はnextRefreshAtを返し、同時刻にshiftを追加し、期間終了同時刻に除外する", async () => {
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
