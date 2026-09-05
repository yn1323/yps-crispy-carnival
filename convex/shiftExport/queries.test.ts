import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_ASSIGNMENT_LIMIT, SHIFT_BOARD_STAFF_LIMIT } from "../constants";
import { buildConfirmationSnapshotSignature } from "../notification/confirmationSnapshots";

const SUBJECT = "export_manager";

async function seedExport(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const manager = await seedManagerShop(ctx, { subject: SUBJECT, shopName: "帳票店舗" });
    const staffId = await seedStaff(ctx, { shopId: manager.shopId, name: "スタッフA", email: "private@example.com" });
    const positionId = await ctx.db.insert("positions", {
      shopId: manager.shopId,
      name: "非表示のポジション",
      color: "#000000",
      sortOrder: 0,
      isDefault: true,
      isDeleted: false,
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: manager.shopId,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      deadline: "2026-08-25",
      shopClosedDates: ["2026-09-06"],
      status: "open",
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    });
    return { ...manager, recruitmentId, staffId, positionId };
  });
}

type Fixture = Awaited<ReturnType<typeof seedExport>>;

function query(t: TestConvex<typeof schema>, ids: Fixture, refreshDayKey = "2026-09-05:test") {
  return t.withIdentity({ subject: SUBJECT }).query(api.shiftExport.queries.getShiftExportData, {
    shopId: ids.shopId,
    expectedOrganizationId: ids.organizationId,
    recruitmentId: ids.recruitmentId,
    refreshDayKey,
  });
}

function assignment(ids: Fixture, overrides: Partial<Doc<"shiftAssignments">> = {}) {
  return {
    recruitmentId: ids.recruitmentId,
    staffId: ids.staffId,
    date: "2026-09-01",
    startTime: "09:00",
    endTime: "17:00",
    positionId: ids.positionId,
    ...overrides,
  };
}

async function seedSnapshot(
  ctx: MutationCtx,
  ids: Fixture,
  overrides: { signature?: string; staffId?: Id<"staffs"> } = {},
) {
  const assignments = [{ date: "2026-09-01", startTime: "09:00", endTime: "17:00", positionId: ids.positionId }];
  await ctx.db.insert("shiftConfirmationSnapshots", {
    recruitmentId: ids.recruitmentId,
    staffId: overrides.staffId ?? ids.staffId,
    assignments,
    signature: overrides.signature ?? buildConfirmationSnapshotSignature(assignments),
    sentAt: 1000,
    updatedAt: 1000,
  });
}

async function seedConfirmationDelivery(
  ctx: MutationCtx,
  ids: Fixture,
  options: {
    operationKey: string;
    status: Doc<"notificationOutbox">["status"];
    staffId?: Id<"staffs">;
    operation?: Partial<Doc<"notificationFanoutOperations">>;
    outbox?: Partial<Doc<"notificationOutbox">>;
  },
) {
  const staffId = options.staffId ?? ids.staffId;
  const operationId = await ctx.db.insert("notificationFanoutOperations", {
    operationKey: options.operationKey,
    kind: "confirmation",
    purpose: "confirmation",
    recruitmentId: ids.recruitmentId,
    shopId: ids.shopId,
    targetStaffIds: [staffId],
    cursor: 1,
    status: "completed",
    dedupeSuffix: options.operationKey,
    supersedesActiveOperations: true,
    createdAt: 1000,
    updatedAt: 1000,
    ...options.operation,
  });
  await ctx.db.insert("notificationOutbox", {
    channel: "email",
    status: options.status,
    dedupeKey: `primary:${options.operationKey}:${staffId}`,
    fanoutTargetKey: `fanout:${options.operationKey}:${staffId}`,
    fanoutOperationId: operationId,
    shopId: ids.shopId,
    organizationId: ids.organizationId,
    purpose: "business",
    recruitmentId: ids.recruitmentId,
    staffId,
    notificationContext: "confirmation fixture",
    deliverySuppressed: false,
    payload: {
      kind: "email",
      from: "sender@example.com",
      to: "staff@example.com",
      context: "fixture",
      subject: "fixture",
      html: "fixture",
    },
    attemptCount: 1,
    nextRunAt: 1000,
    createdAt: 1000,
    updatedAt: 1000,
    ...options.outbox,
  });
  return operationId;
}

describe("shiftExport/queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-09-05T00:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    "anonymous",
    "staff",
    "removedMembership",
    "otherOrganization",
    "otherRecruitment",
    "otherShopRecruitment",
    "deletedRecruitment",
    "deletedShop",
    "deletedOrganization",
  ] as const)("%s の境界では帳票を返さない", async (kind) => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    const deniedArgs = {
      shopId: ids.shopId,
      expectedOrganizationId: ids.organizationId,
      recruitmentId: ids.recruitmentId,
      refreshDayKey: "2026-09-05:test",
    };
    await t.run(async (ctx) => {
      if (kind === "staff") {
        const userId = await seedUser(ctx, "export_staff");
        await seedStaff(ctx, { shopId: ids.shopId, name: "スタッフ用アカウント", userId });
      }
      if (kind === "removedMembership") await ctx.db.patch(ids.memberId, { status: "removed" });
      if (kind === "deletedRecruitment") await ctx.db.patch(ids.recruitmentId, { isDeleted: true });
      if (kind === "deletedShop") await ctx.db.patch(ids.shopId, { isDeleted: true });
      if (kind === "deletedOrganization") await ctx.db.patch(ids.organizationId, { isDeleted: true });
      if (kind === "otherShopRecruitment") {
        const shopId = await ctx.db.insert("shops", {
          organizationId: ids.organizationId,
          name: "同一組織の別店舗",
          regularClosedDays: [],
          submissionPattern: { kind: "dateOnly" },
          isDeleted: false,
        });
        deniedArgs.recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-09-01",
          periodEnd: "2026-09-30",
          deadline: "2026-08-25",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "dateOnly" },
        });
      }
      if (kind === "otherOrganization" || kind === "otherRecruitment") {
        const other = await seedManagerShop(ctx, { subject: "other_export_manager" });
        if (kind === "otherOrganization") deniedArgs.expectedOrganizationId = other.organizationId;
        else
          deniedArgs.recruitmentId = await ctx.db.insert("recruitments", {
            shopId: other.shopId,
            periodStart: "2026-09-01",
            periodEnd: "2026-09-30",
            deadline: "2026-08-25",
            shopClosedDates: [],
            status: "open",
            isDeleted: false,
            submissionPattern: { kind: "dateOnly" },
          });
      }
    });
    const actor = kind === "anonymous" ? t : t.withIdentity({ subject: kind === "staff" ? "export_staff" : SUBJECT });
    expect(await actor.query(api.shiftExport.queries.getShiftExportData, deniedArgs)).toBeNull();
  });

  it("保存済み割当と募集の設定だけを最小DTOで返し、希望・PII・ポジションを含めない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, { draftSavedAt: 3000 });
      await ctx.db.insert("shiftAssignments", assignment(ids));
      const submissionId = await ctx.db.insert("shiftSubmissions", {
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        firstSubmittedAt: 1000,
        submittedAt: 2000,
      });
      await ctx.db.insert("shiftSubmissionSlots", {
        submissionId,
        recruitmentId: ids.recruitmentId,
        staffId: ids.staffId,
        date: "2026-09-02",
        startTime: "10:00",
        endTime: "18:00",
      });
      await ctx.db.patch(ids.shopId, {
        name: "帳票店舗",
        submissionPattern: { kind: "dateOnly" },
        regularClosedDays: ["mon"],
      });
    });
    expect(await query(t, ids)).toEqual({
      shopName: "帳票店舗",
      recruitment: {
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        shopClosedDates: ["2026-09-06"],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        draftSavedAt: 3000,
        confirmedAt: null,
        isConfirmed: false,
      },
      staffs: [{ id: ids.staffId, name: "スタッフA", isRemoved: false }],
      assignments: [{ staffId: ids.staffId, date: "2026-09-01", startTime: "09:00", endTime: "17:00", optionId: null }],
      confirmationState: "unconfirmed",
      contentComparison: "notApplicable",
      notificationState: "notApplicable",
      exportBlockReason: null,
    });
  });

  it("未保存・全員非出勤の保存・スタッフ0件を区別し、閲覧は書き込み制限に依存しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    expect((await query(t, ids))?.exportBlockReason).toBe("noSavedShifts");
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, { draftSavedAt: 1000 });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (billing) await ctx.db.delete(billing._id);
    });
    expect(await query(t, ids)).toMatchObject({ assignments: [], exportBlockReason: null });
    await t.run(async (ctx) => await ctx.db.patch(ids.staffId, { excludedFromShift: true }));
    expect((await query(t, ids))?.exportBlockReason).toBe("noStaffs");
  });

  it.each([false, true])("保存順を全staffで検証し、不完全=%sなら作成順へ全体fallbackする", async (incomplete) => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    const staffB = await t.run(async (ctx) => {
      const staffB = await seedStaff(ctx, { shopId: ids.shopId, name: "スタッフB" });
      const excluded = await seedStaff(ctx, { shopId: ids.shopId, name: "対象外", excludedFromShift: true });
      const staffRows = await Promise.all([staffB, excluded, ids.staffId].map((id) => ctx.db.get(id)));
      await ctx.db.insert("organizationStaffOrderStates", {
        organizationId: ids.organizationId,
        revision: 1,
        activatedAt: 1000,
        updatedAt: 1000,
      });
      await ctx.db.insert("organizationStaffOrderEntries", {
        organizationId: ids.organizationId,
        organizationPersonId: ids.personId,
        displayOrder: 0,
      });
      for (const [index, staff] of staffRows.entries()) {
        if (!staff) throw new Error("staff fixture missing");
        await ctx.db.insert("organizationStaffOrderEntries", {
          organizationId: ids.organizationId,
          organizationPersonId: staff.organizationPersonId,
          displayOrder: index + 1,
        });
        if (incomplete && staff._id === excluded) continue;
        await ctx.db.insert("shopStaffOrderEntries", {
          organizationId: ids.organizationId,
          shopId: ids.shopId,
          staffId: staff._id,
          organizationPersonId: staff.organizationPersonId,
          displayOrder: index + 1,
        });
      }
      return staffB;
    });
    expect((await query(t, ids))?.staffs.map((staff) => staff.id)).toEqual(
      incomplete ? [ids.staffId, staffB] : [staffB, ids.staffId],
    );
  });

  it.each(["excluded", "foreign", "missing", "currentRemoved"] as const)(
    "%s の保存割当を黙って省略せず、出力を止める",
    async (kind) => {
      const t = convexTest(schema, modules);
      const ids = await seedExport(t);
      await t.run(async (ctx) => {
        let staffId = ids.staffId;
        if (kind === "foreign") {
          const other = await seedManagerShop(ctx, { subject: "other_staff_owner" });
          staffId = await seedStaff(ctx, { shopId: other.shopId, name: "他組織の個人情報" });
        }
        if (kind === "excluded") await ctx.db.patch(staffId, { excludedFromShift: true });
        if (kind === "currentRemoved") await ctx.db.patch(staffId, { isDeleted: true });
        if (kind === "missing") await ctx.db.delete(staffId);
        await ctx.db.insert("shiftAssignments", assignment(ids, { staffId }));
      });
      const result = await query(t, ids);
      expect(result?.exportBlockReason).toBe("excludedStaffAssignments");
      expect(result?.assignments).toEqual([]);
      expect(result?.staffs.every((staff) => staff.id === ids.staffId)).toBe(true);
    },
  );

  it("過去募集では保存割当のある同一店舗の削除staffだけを末尾へ追加する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    const removedId = await t.run(async (ctx) => {
      const removed = await seedStaff(ctx, { shopId: ids.shopId, name: "退店スタッフ", isDeleted: true });
      await seedStaff(ctx, { shopId: ids.shopId, name: "割当なしの退店スタッフ", isDeleted: true });
      await ctx.db.insert("shiftAssignments", assignment(ids, { staffId: removed }));
      return removed;
    });
    vi.setSystemTime(Date.parse("2026-10-01T00:00:00+09:00"));
    expect(await query(t, ids)).toMatchObject({
      staffs: [
        { id: ids.staffId, isRemoved: false },
        { id: removedId, name: "退店スタッフ", isRemoved: true },
      ],
      assignments: [{ staffId: removedId }],
      exportBlockReason: null,
    });
  });

  it("JST日付変更後の再取得で削除staffの保存割当を出力し、clientの日付キーでは過去判定を変えない", async () => {
    vi.setSystemTime(Date.parse("2026-09-30T23:59:59+09:00"));
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.staffId, { isDeleted: true });
      await ctx.db.insert("shiftAssignments", assignment(ids));
    });

    const current = await query(t, ids, "2099-01-01:client-ahead");
    expect(current).toMatchObject({ staffs: [], assignments: [], exportBlockReason: "excludedStaffAssignments" });

    vi.setSystemTime(Date.parse("2026-10-01T00:00:00+09:00"));
    const past = await query(t, ids, "2026-10-01:refreshed");
    expect(past).not.toBeNull();
    expect(past?.staffs).toEqual([{ id: ids.staffId, name: "スタッフA", isRemoved: true }]);
    expect(past?.assignments).toEqual([
      { staffId: ids.staffId, date: "2026-09-01", startTime: "09:00", endTime: "17:00", optionId: null },
    ]);
    expect(past?.exportBlockReason).toBeNull();
  });

  it.each(["period", "staffs", "assignments", "historicalStaffs"] as const)(
    "%s の上限超過は部分成功へ倒さない",
    async (kind) => {
      const t = convexTest(schema, modules);
      const ids = await seedExport(t);
      await t.run(async (ctx) => {
        if (kind === "period") await ctx.db.patch(ids.recruitmentId, { periodEnd: "2026-10-02" });
        if (kind === "staffs" || kind === "historicalStaffs") {
          for (let index = 0; index < SHIFT_BOARD_STAFF_LIMIT; index += 1) {
            const staffId = await seedStaff(ctx, {
              shopId: ids.shopId,
              name: `スタッフ${index}`,
              isDeleted: kind === "historicalStaffs",
            });
            if (kind === "historicalStaffs") await ctx.db.insert("shiftAssignments", assignment(ids, { staffId }));
          }
        }
        if (kind === "assignments") {
          for (let index = 0; index <= SHIFT_ASSIGNMENT_LIMIT; index += 1)
            await ctx.db.insert("shiftAssignments", assignment(ids));
        }
      });
      await expect(query(t, ids)).rejects.toThrow();
    },
  );

  it("31日・200staff・2000割当の境界値では全件を返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, { periodEnd: "2026-10-01", submissionPattern: { kind: "dateOnly" } });
      const staffIds = [ids.staffId];
      for (let index = 1; index < SHIFT_BOARD_STAFF_LIMIT; index += 1) {
        staffIds.push(await seedStaff(ctx, { shopId: ids.shopId, name: `スタッフ${index}` }));
      }
      for (const staffId of staffIds) {
        for (const day of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]) {
          await ctx.db.insert(
            "shiftAssignments",
            assignment(ids, {
              staffId,
              date: `2026-09-${String(day).padStart(2, "0")}`,
              startTime: "00:00",
              endTime: "24:00",
            }),
          );
        }
      }
    });
    const result = await query(t, ids);
    expect(result?.staffs).toHaveLength(SHIFT_BOARD_STAFF_LIMIT);
    expect(result?.assignments).toHaveLength(SHIFT_ASSIGNMENT_LIMIT);
    expect(result?.recruitment.periodEnd).toBe("2026-10-01");
    expect(result?.exportBlockReason).toBeNull();
  });

  it.each(["same", "different", "adjacent", "missing", "corrupt", "mixedUnknown", "positionChanged"] as const)(
    "snapshotの%sを保存時刻と独立して判定する",
    async (kind) => {
      const t = convexTest(schema, modules);
      const ids = await seedExport(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.recruitmentId, { status: "confirmed", confirmedAt: 1000, draftSavedAt: 2000 });
        let positionId = ids.positionId;
        if (kind === "positionChanged")
          positionId = await ctx.db.insert("positions", {
            shopId: ids.shopId,
            name: "変更先",
            color: "#000000",
            sortOrder: 1,
            isDefault: false,
            isDeleted: false,
          });
        await ctx.db.insert(
          "shiftAssignments",
          assignment(ids, {
            startTime: kind === "different" || kind === "mixedUnknown" ? "10:00" : "09:00",
            endTime: kind === "adjacent" ? "12:00" : "17:00",
            positionId,
          }),
        );
        if (kind === "adjacent") await ctx.db.insert("shiftAssignments", assignment(ids, { startTime: "12:00" }));
        if (kind !== "missing") await seedSnapshot(ctx, ids, kind === "corrupt" ? { signature: "corrupt" } : {});
        if (kind === "mixedUnknown") await seedStaff(ctx, { shopId: ids.shopId, name: "比較情報がない追加スタッフ" });
      });
      const result = await query(t, ids);
      const expected =
        kind === "missing" || kind === "corrupt" || kind === "mixedUnknown"
          ? "unknown"
          : kind === "different" || kind === "positionChanged"
            ? "different"
            : "same";
      expect(result?.confirmationState).toBe("confirmed");
      expect(result?.contentComparison).toBe(expected);
      expect(result?.notificationState).toBe("unknown");
      if (kind === "adjacent")
        expect(result?.assignments).toEqual([
          { staffId: ids.staffId, date: "2026-09-01", startTime: "09:00", endTime: "17:00", optionId: null },
        ]);
    },
  );

  it.each(["pending", "processing", "failed", "sent", "suppressed", "missing", "fallback"] as const)(
    "通知%sを内容一致だけで送信完了にしない",
    async (kind) => {
      const t = convexTest(schema, modules);
      const ids = await seedExport(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.recruitmentId, {
          status: "confirmed",
          confirmedAt: 1000,
          lastConfirmationNotificationOperationKey: "export_operation",
        });
        await ctx.db.insert("shiftAssignments", assignment(ids));
        await seedSnapshot(ctx, ids);
        const operationId = await ctx.db.insert("notificationFanoutOperations", {
          operationKey: "export_operation",
          kind: "confirmation",
          purpose: "confirmation",
          recruitmentId: ids.recruitmentId,
          shopId: ids.shopId,
          targetStaffIds: [ids.staffId],
          cursor: 1,
          status: kind === "pending" ? "pending" : "completed",
          dedupeSuffix: "export",
          supersedesActiveOperations: true,
          createdAt: 1000,
          updatedAt: 1000,
        });
        if (kind === "missing") return;
        const outbox = {
          channel: "email" as const,
          status: kind === "suppressed" ? ("sent" as const) : kind === "fallback" ? ("failed" as const) : kind,
          dedupeKey: "primary-export",
          fanoutTargetKey: `fanout:export_operation:${ids.staffId}`,
          fanoutOperationId: operationId,
          shopId: ids.shopId,
          organizationId: ids.organizationId,
          purpose: "business" as const,
          recruitmentId: ids.recruitmentId,
          staffId: ids.staffId,
          notificationContext: "private context",
          deliverySuppressed: kind === "suppressed",
          payload: {
            kind: "email" as const,
            from: "sender@example.com",
            context: "private context",
            to: "secret@example.com",
            subject: "private subject",
            html: "private body",
          },
          attemptCount: 0,
          nextRunAt: 1000,
          createdAt: 1000,
          updatedAt: 1000,
        };
        await ctx.db.insert("notificationOutbox", outbox);
        if (kind === "fallback")
          await ctx.db.insert("notificationOutbox", {
            ...outbox,
            fanoutTargetKey: undefined,
            dedupeKey: `email:confirmation:${ids.recruitmentId}:${ids.staffId}:export`,
            status: "sent",
          });
      });
      const result = await query(t, ids);
      expect(result?.contentComparison).toBe("same");
      expect(result?.notificationState).toBe(
        kind === "missing" || kind === "suppressed"
          ? "unknown"
          : kind === "processing"
            ? "pending"
            : kind === "fallback"
              ? "sent"
              : kind,
      );
    },
  );

  it.each([
    ["sent", "sent"],
    ["failed", "failed"],
    ["pending", "pending"],
    ["processing", "pending"],
  ] as const)("同じ確定内容の補助再送が%sならcanonicalの失敗を%sとして集約する", async (status, expected) => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, {
        status: "confirmed",
        draftSavedAt: 1000,
        lastConfirmationNotificationOperationKey: "canonical",
      });
      await seedConfirmationDelivery(ctx, ids, { operationKey: "canonical", status: "failed" });
      await seedConfirmationDelivery(ctx, ids, {
        operationKey: "supplemental",
        status,
        operation: {
          purpose: "confirmation_resend",
          supersedesActiveOperations: false,
          confirmationOperationKeyAtOrigin: "canonical",
          recruitmentDraftSavedAtAtOrigin: 1000,
        },
      });
    });
    expect((await query(t, ids))?.notificationState).toBe(expected);
  });

  it("補助fanoutがOutbox作成前なら元の失敗を処理中として表示する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, {
        status: "confirmed",
        draftSavedAt: 1000,
        lastConfirmationNotificationOperationKey: "canonical",
      });
      await seedConfirmationDelivery(ctx, ids, { operationKey: "canonical", status: "failed" });
      await seedConfirmationDelivery(ctx, ids, {
        operationKey: "supplemental",
        status: "pending",
        operation: {
          status: "pending",
          cursor: 0,
          purpose: "confirmation_resend",
          supersedesActiveOperations: false,
          confirmationOperationKeyAtOrigin: "canonical",
          recruitmentDraftSavedAtAtOrigin: 1000,
        },
      });
      const outbox = await ctx.db
        .query("notificationOutbox")
        .withIndex("by_fanoutTargetKey", (q) => q.eq("fanoutTargetKey", `fanout:supplemental:${ids.staffId}`))
        .unique();
      if (!outbox) throw new Error("Missing supplemental outbox fixture");
      await ctx.db.delete(outbox._id);
    });
    expect((await query(t, ids))?.notificationState).toBe("pending");
  });

  it("同じ内容を補助再送で実送信済みなら後の再送失敗で完了を取り消さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, {
        status: "confirmed",
        draftSavedAt: 1000,
        lastConfirmationNotificationOperationKey: "canonical",
      });
      await seedConfirmationDelivery(ctx, ids, { operationKey: "canonical", status: "failed" });
      for (const status of ["sent", "failed"] as const) {
        await seedConfirmationDelivery(ctx, ids, {
          operationKey: `supplemental-${status}`,
          status,
          operation: {
            purpose: "confirmation_resend",
            supersedesActiveOperations: false,
            confirmationOperationKeyAtOrigin: "canonical",
            recruitmentDraftSavedAtAtOrigin: 1000,
          },
        });
      }
    });
    expect((await query(t, ids))?.notificationState).toBe("sent");
  });

  it.each([
    "oldConfirmation",
    "oldDraft",
    "missingOrigin",
    "otherStaff",
    "otherShop",
    "cancelled",
    "suppressed",
  ] as const)("%sの補助再送成功を現在の対象staffへの送信完了と扱わない", async (kind) => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, {
        status: "confirmed",
        draftSavedAt: 1000,
        lastConfirmationNotificationOperationKey: "canonical",
      });
      await seedConfirmationDelivery(ctx, ids, { operationKey: "canonical", status: "failed" });
      const otherStaffId = await seedStaff(ctx, { shopId: ids.shopId, name: "対象外staff" });
      const otherShopId =
        kind === "otherShop" ? (await seedManagerShop(ctx, { subject: "other_delivery_manager" })).shopId : ids.shopId;
      await seedConfirmationDelivery(ctx, ids, {
        operationKey: "supplemental",
        status: "sent",
        staffId: kind === "otherStaff" ? otherStaffId : ids.staffId,
        operation: {
          purpose: "confirmation_resend",
          supersedesActiveOperations: false,
          confirmationOperationKeyAtOrigin:
            kind === "oldConfirmation" ? "older-canonical" : kind === "missingOrigin" ? undefined : "canonical",
          recruitmentDraftSavedAtAtOrigin: kind === "oldDraft" ? 999 : 1000,
          shopId: otherShopId,
          status: kind === "cancelled" ? "cancelled" : "completed",
        },
        outbox: { deliverySuppressed: kind === "suppressed" },
      });
    });
    expect((await query(t, ids))?.notificationState).toBe("failed");
  });

  it("別staffの未送信を一人の補助再送成功で覆わず、全対象が送信できた時点で完了にする", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExport(t);
    const otherStaffId = await t.run(async (ctx) => {
      await ctx.db.patch(ids.recruitmentId, {
        status: "confirmed",
        draftSavedAt: 1000,
        lastConfirmationNotificationOperationKey: "canonical",
      });
      const staffId = await seedStaff(ctx, { shopId: ids.shopId, name: "対象staff B" });
      await seedConfirmationDelivery(ctx, ids, {
        operationKey: "canonical",
        status: "failed",
        operation: { targetStaffIds: [ids.staffId, staffId] },
      });
      await seedConfirmationDelivery(ctx, ids, {
        operationKey: "supplemental-a",
        status: "sent",
        operation: {
          purpose: "confirmation_resend",
          supersedesActiveOperations: false,
          confirmationOperationKeyAtOrigin: "canonical",
          recruitmentDraftSavedAtAtOrigin: 1000,
        },
      });
      return staffId;
    });
    expect((await query(t, ids))?.notificationState).toBe("unknown");
    await t.run(async (ctx) => {
      await seedConfirmationDelivery(ctx, ids, {
        operationKey: "supplemental-b",
        staffId: otherStaffId,
        status: "sent",
        operation: {
          purpose: "confirmation_resend",
          supersedesActiveOperations: false,
          confirmationOperationKeyAtOrigin: "canonical",
          recruitmentDraftSavedAtAtOrigin: 1000,
        },
      });
    });
    expect((await query(t, ids))?.notificationState).toBe("sent");
  });
});
