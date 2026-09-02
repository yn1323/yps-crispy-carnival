import { ConvexError } from "convex/values";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedLegacyShopMembership, seedManagerShop, seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_ASSIGNMENT_LIMIT } from "../constants";
import {
  buildConfirmationSnapshotSignature,
  buildConfirmationSnapshotsForStaffs,
} from "../notification/confirmationSnapshots";
import { type AssignmentIssueCode, parseShiftAssignmentValidationError } from "./validation";

const CONFIRMATION_EMAIL_JOB = "notification/actions:sendShiftConfirmationEmails";
const PAST_SHIFT_SAVE_ERROR = "過去のシフトは保存できません";
const PAST_SHIFT_NOTIFY_ERROR = "過去のシフトはスタッフに通知できません";

/** 構造化バリデーションエラーがthrowされ、期待したissuesを全件含むことを検証する */
async function expectValidationIssues(
  promise: Promise<unknown>,
  expected: Array<{ code: AssignmentIssueCode; date: string; staffId: string }>,
) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConvexError);
  const issues = parseShiftAssignmentValidationError(error);
  expect(issues).not.toBeNull();
  expect(issues?.map(({ code, date, staffId }) => ({ code, date, staffId }))).toEqual(expected);
}

/** テスト用にshop + user + recruitment + staffsをセットアップ */
async function setupTestData(t: TestConvex<typeof schema>, options?: { shopClosedDates?: string[] }) {
  const result = await t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
      subject: "user_manager",
      email: "manager@example.com",
      shopName: "テスト店舗",
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-01-20",
      periodEnd: "2026-01-26",
      deadline: "2026-01-17",
      shopClosedDates: options?.shopClosedDates ?? [],
      status: "open",
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    });
    const staffId1 = await seedStaff(ctx, {
      shopId,
      name: "鈴木太郎",
      email: "suzuki@example.com",
    });
    const staffId2 = await seedStaff(ctx, {
      shopId,
      name: "佐藤花子",
      email: "sato@example.com",
    });
    return { shopId, recruitmentId, staffId1, staffId2 };
  });

  return result;
}

async function seedCurrentConfirmationSnapshots(
  t: TestConvex<typeof schema>,
  recruitmentId: Id<"recruitments">,
  staffIds: Id<"staffs">[],
) {
  await t.run(async (ctx) => {
    const assignments = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect();
    const snapshots = buildConfirmationSnapshotsForStaffs(
      staffIds,
      assignments.map((assignment) => ({
        staffId: assignment.staffId,
        date: assignment.date,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        positionId: assignment.positionId,
        ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
      })),
      true,
    );
    for (const snapshot of snapshots) {
      await ctx.db.insert("shiftConfirmationSnapshots", {
        recruitmentId,
        staffId: snapshot.staffId,
        signature: snapshot.signature,
        assignments: snapshot.assignments,
        sentAt: 1_000,
        updatedAt: 1_000,
      });
    }
  });
}

async function seedConfirmationEmailOutboxes(
  t: TestConvex<typeof schema>,
  recruitmentId: Id<"recruitments">,
  staffIds: Id<"staffs">[],
  status: "pending" | "processing" | "sent",
) {
  return await t.run(async (ctx) => {
    const recruitment = await ctx.db.get(recruitmentId);
    const operationKey = recruitment?.lastConfirmationNotificationOperationKey;
    if (!recruitment || !operationKey) throw new Error("previous confirmation operation was not recorded");
    const operation = await ctx.db
      .query("notificationFanoutOperations")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
      .unique();
    if (!operation) throw new Error("previous confirmation operation was not created");
    const now = Date.now();
    const outboxIds: Id<"notificationOutbox">[] = [];

    for (const staffId of staffIds) {
      const staff = await ctx.db.get(staffId);
      if (!staff) throw new Error("confirmation staff was not found");
      outboxIds.push(
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status,
          dedupeKey: `email:confirmation:${recruitmentId}:${staffId}:${operation.dedupeSuffix}`,
          fanoutTargetKey: `fanout:${operationKey}:${staffId}`,
          fanoutOperationId: operation._id,
          shopId: recruitment.shopId,
          recruitmentId,
          staffId,
          purpose: "business",
          payload: {
            kind: "email",
            from: "シフトリ <noreply@example.com>",
            to: staff.email,
            subject: "シフト確定のお知らせ",
            html: "<p>シフト確定のお知らせ</p>",
            context: "notification.sendConfirmationEmail",
          },
          attemptCount: status === "pending" ? 0 : 1,
          nextRunAt: now,
          ...(status === "processing" ? { processingStartedAt: now } : {}),
          ...(status === "sent" ? { sentAt: now, terminalAt: now } : {}),
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    return outboxIds;
  });
}

async function seedLineConfirmationWithFallback(
  t: TestConvex<typeof schema>,
  recruitmentId: Id<"recruitments">,
  staffId: Id<"staffs">,
  fallbackStatus: "processing" | "sent",
) {
  await t.run(async (ctx) => {
    const recruitment = await ctx.db.get(recruitmentId);
    const operationKey = recruitment?.lastConfirmationNotificationOperationKey;
    if (!recruitment || !operationKey) throw new Error("previous confirmation operation was not recorded");
    const operation = await ctx.db
      .query("notificationFanoutOperations")
      .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
      .unique();
    const staff = await ctx.db.get(staffId);
    if (!operation || !staff) throw new Error("confirmation delivery target was not found");
    const now = Date.now();
    const fallbackDedupeKey = `email:confirmation:${recruitmentId}:${staffId}:${operation.dedupeSuffix}`;
    const emailPayload = {
      kind: "email" as const,
      from: "シフトリ <noreply@example.com>",
      to: staff.email,
      subject: "シフト確定のお知らせ",
      html: "<p>シフト確定のお知らせ</p>",
      context: "notification.sendConfirmationEmail",
    };

    await ctx.db.insert("notificationOutbox", {
      channel: "line",
      status: "failed",
      dedupeKey: `line:confirmation:${recruitmentId}:${staffId}:${operation.dedupeSuffix}`,
      fanoutTargetKey: `fanout:${operationKey}:${staffId}`,
      fanoutOperationId: operation._id,
      shopId: recruitment.shopId,
      recruitmentId,
      staffId,
      purpose: "business",
      payload: {
        kind: "line",
        toUserId: `U-${staffId}`,
        text: "シフト確定のお知らせ",
        fallbackEmail: { dedupeKey: fallbackDedupeKey, payload: emailPayload },
      },
      attemptCount: 1,
      nextRunAt: now,
      lastError: "line_quota_fallback_enqueued",
      failedAt: now,
      terminalAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: fallbackStatus,
      dedupeKey: fallbackDedupeKey,
      fanoutOperationId: operation._id,
      shopId: recruitment.shopId,
      recruitmentId,
      staffId,
      purpose: "business",
      payload: emailPayload,
      attemptCount: 1,
      nextRunAt: now,
      ...(fallbackStatus === "processing" ? { processingStartedAt: now } : { sentAt: now, terminalAt: now }),
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("shiftBoard/mutations", () => {
  describe("app organization scope", () => {
    beforeEach(() => {
      vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", "");
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-20T00:00:00+09:00"));
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });

    it("URL組織と募集の店舗組織が一致する場合だけ保存し、別組織targetでは書き込まない", async () => {
      const t = convexTest(schema, modules);
      const target = await setupTestData(t);
      const ids = await t.run(async (ctx) => {
        const shop = await ctx.db.get(target.shopId);
        if (!shop?.organizationId) throw new Error("canonical shop fixture is incomplete");
        const other = await seedOrganizationManagerShop(ctx, {
          subject: "app_shift_board_other_manager",
          shopName: "別組織店舗",
          complimentary: true,
        });
        const otherRecruitmentId = await ctx.db.insert("recruitments", {
          shopId: other.shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-26",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { organizationId: shop.organizationId, other, otherRecruitmentId };
      });
      const actor = t.withIdentity({ subject: "user_manager" });

      await expect(
        actor.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId: target.shopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: target.recruitmentId,
          assignments: [],
        }),
      ).resolves.toBeNull();
      await expect(
        actor.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId: ids.other.shopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: ids.otherRecruitmentId,
          assignments: [],
        }),
      ).rejects.toThrow("Not found");
      await expect(
        actor.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId: target.shopId,
          expectedOrganizationId: ids.other.organizationId,
          recruitmentId: target.recruitmentId,
          intent: "confirm",
        }),
      ).rejects.toThrow("Not found");

      const persisted = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", ids.otherRecruitmentId))
          .collect(),
      );
      expect(persisted).toEqual([]);
    });

    it("removed所属と削除済み店舗ではapp用mutationを拒否する", async () => {
      const t = convexTest(schema, modules);
      const target = await setupTestData(t);
      const ids = await t.run(async (ctx) => {
        const shop = await ctx.db.get(target.shopId);
        const organizationId = shop?.organizationId;
        if (!organizationId) throw new Error("canonical shop fixture is incomplete");
        const member = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        return { organizationId, memberId: member?._id ?? null, userId: member?.userId ?? null };
      });
      const memberId = ids.memberId;
      const userId = ids.userId;
      if (!memberId || !userId) throw new Error("member fixture is incomplete");
      const actor = t.withIdentity({ subject: "user_manager" });

      await t.run(async (ctx) => ctx.db.patch(memberId, { status: "removed", updatedAt: Date.now() }));
      await expect(
        actor.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId: target.shopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: target.recruitmentId,
          assignments: [],
        }),
      ).rejects.toThrow("Not found");

      await t.run(async (ctx) => {
        await ctx.db.patch(memberId, { status: "active", updatedAt: Date.now() });
        await ctx.db.patch(target.shopId, { isDeleted: true });
      });
      await expect(
        actor.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId: target.shopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: target.recruitmentId,
          intent: "confirm",
        }),
      ).rejects.toThrow("Not found");

      await t.run(async (ctx) => {
        await ctx.db.patch(target.shopId, { isDeleted: false });
        await seedLegacyShopMembership(ctx, { userId, shopId: target.shopId });
        await ctx.db.delete(memberId);
      });
      await expect(
        actor.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId: target.shopId,
          expectedOrganizationId: ids.organizationId,
          recruitmentId: target.recruitmentId,
          assignments: [],
        }),
      ).rejects.toThrow("Not found");
    });
  });

  describe("saveShiftAssignments", () => {
    beforeEach(() => {
      vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", "");
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-20T00:00:00+09:00"));
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, shopId } = await setupTestData(t);
      await expect(
        t.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          shopId,
          assignments: [],
        }),
      ).rejects.toThrow();
    });

    it("他店舗のrecruitmentではNot foundエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      // 別のshop+userを作成
      const otherShopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_other",
          email: "other@example.com",
          shopName: "他店舗",
        });
        return shopId;
      });

      await expect(
        t.withIdentity({ subject: "user_other" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          shopId: otherShopId,
          assignments: [],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("正常にシフト割当を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0].staffId).toBe(staffId1);
      expect(assignments[0].startTime).toBe("10:00");
    });

    it("実defaultと省略defaultの完全隣接区間を一件で保存する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      const positionId = await t.run(async (ctx) =>
        ctx.db.insert("positions", {
          shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        }),
      );

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          {
            staffId: staffId1,
            date: "2026-01-20",
            startTime: "10:00",
            endTime: "12:00",
            positionId,
          },
          { staffId: staffId1, date: "2026-01-20", startTime: "12:00", endTime: "18:00" },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0]).toMatchObject({
        staffId: staffId1,
        date: "2026-01-20",
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
    });

    it("他店舗positionと省略defaultの隣接入力は全体を副作用なく拒否する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      const otherPositionId = await t.run(async (ctx) => {
        const other = await seedManagerShop(ctx, {
          subject: "other_position_manager",
          email: "other-position-manager@example.com",
          shopName: "他店舗position",
        });
        return await ctx.db.insert("positions", {
          shopId: other.shopId,
          name: "他店舗position",
          color: "#ef4444",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [
            {
              staffId: staffId1,
              date: "2026-01-20",
              startTime: "10:00",
              endTime: "12:00",
              positionId: otherPositionId,
            },
            { staffId: staffId1, date: "2026-01-20", startTime: "12:00", endTime: "18:00" },
          ],
        }),
      ).rejects.toThrow("Not found");

      const state = await t.run(async (ctx) => ({
        assignments: await ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
        recruitment: await ctx.db.get(recruitmentId),
        ownPositions: await ctx.db
          .query("positions")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
          .collect(),
      }));
      expect(state.assignments).toEqual([]);
      expect(state.recruitment?.draftSavedAt).toBeUndefined();
      expect(state.ownPositions).toEqual([]);
    });

    it("保存済み割当が上限を超える場合は保存も確定も副作用なく拒否する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        const positionId = await ctx.db.insert("positions", {
          shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });
        for (let index = 0; index <= SHIFT_ASSIGNMENT_LIMIT; index += 1) {
          await ctx.db.insert("shiftAssignments", {
            recruitmentId,
            staffId: staffId1,
            date: "2026-01-20",
            startTime: "10:00",
            endTime: "11:00",
            positionId,
          });
        }
      });

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [],
        }),
      ).rejects.toThrow("保存済みシフト割当が上限を超えています");
      await expect(
        t.run(async (ctx) =>
          ctx.db
            .query("shiftAssignments")
            .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
            .collect(),
        ),
      ).resolves.toHaveLength(SHIFT_ASSIGNMENT_LIMIT + 1);

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
        }),
      ).rejects.toThrow("保存済みシフト割当が上限を超えています");
      const confirmationState = await t.run(async (ctx) => ({
        recruitment: await ctx.db.get(recruitmentId),
        operations: await ctx.db.query("notificationFanoutOperations").collect(),
        jobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === CONFIRMATION_EMAIL_JOB,
        ),
      }));
      expect(confirmationState.recruitment?.status).toBe("open");
      expect(confirmationState.operations).toEqual([]);
      expect(confirmationState.jobs).toEqual([]);
    });

    it("入力割当が上限を超える場合は検証境界で副作用なく拒否する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      const assignments = Array.from({ length: SHIFT_ASSIGNMENT_LIMIT + 1 }, () => ({
        staffId: staffId1,
        date: "2026-01-20",
        startTime: "10:00",
        endTime: "11:00",
      }));

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments,
        }),
      ).rejects.toThrow("シフト割当が上限を超えています");
      const state = await t.run(async (ctx) => ({
        assignments: await ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
        recruitment: await ctx.db.get(recruitmentId),
      }));
      expect(state.assignments).toEqual([]);
      expect(state.recruitment?.draftSavedAt).toBeUndefined();
    });

    it("勤務区分IDつきのシフト割当を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
              { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00", sortOrder: 1 },
            ],
          },
        });
      });

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          {
            staffId: staffId1,
            date: "2026-01-20",
            startTime: "09:00",
            endTime: "13:00",
            optionId: "morning",
          },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0].optionId).toBe("morning");
    });

    it("日ごと入力方式では完全隣接区間を時間方式として統合しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => await ctx.db.patch(recruitmentId, { submissionPattern: { kind: "dateOnly" } }));

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "09:00", endTime: "12:00" },
          { staffId: staffId1, date: "2026-01-20", startTime: "12:00", endTime: "22:00" },
        ],
      });

      await expect(
        t.run(async (ctx) =>
          ctx.db
            .query("shiftAssignments")
            .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
            .collect(),
        ),
      ).resolves.toHaveLength(2);
    });

    it("不正な日付・時刻形式のシフト割当は構造化エラーで拒否する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await expectValidationIssues(
        asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-02-31", startTime: "10:00", endTime: "18:00" }],
        }),
        [{ code: "INVALID_DATE_FORMAT", date: "2026-02-31", staffId: staffId1 }],
      );
      await expectValidationIssues(
        asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId2, date: "2026-01-20", startTime: "bad", endTime: "18:00" }],
        }),
        [{ code: "INVALID_TIME_FORMAT", date: "2026-01-20", staffId: staffId2 }],
      );
    });

    it("勤務区分募集では勤務区分IDなしの割当を保存できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 }],
          },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [
            {
              staffId: staffId1,
              date: "2026-01-20",
              startTime: "09:00",
              endTime: "13:00",
            },
          ],
        }),
        [{ code: "SHIFT_TYPE_REQUIRED", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("存在しない勤務区分IDは保存できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 }],
          },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [
            {
              staffId: staffId1,
              date: "2026-01-20",
              startTime: "09:00",
              endTime: "13:00",
              optionId: "late",
            },
          ],
        }),
        [{ code: "SHIFT_TYPE_NOT_FOUND", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("勤務区分IDと時間が一致しない割当は保存できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 }],
          },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [
            {
              staffId: staffId1,
              date: "2026-01-20",
              startTime: "10:00",
              endTime: "14:00",
              optionId: "morning",
            },
          ],
        }),
        [{ code: "SHIFT_TYPE_TIME_MISMATCH", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("分つきシフト時間の境界内なら保存できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: { kind: "time", startTime: "05:30", endTime: "22:30" },
        });
      });
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "05:30", endTime: "06:30" },
          { staffId: staffId2, date: "2026-01-20", startTime: "21:30", endTime: "22:30" },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(2);
    });

    it("空のassignmentsで保存できる（全員休み）", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(0);
      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.draftSavedAt).toBeTypeOf("number");
    });

    it("保存時にdraftSavedAtを更新する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.draftSavedAt).toBeTypeOf("number");
    });

    it("過去シフトの下書き保存は拒否し、既存割当を置き換えない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        if (!recruitment) throw new Error("missing recruitment");
        const positionId = await ctx.db.insert("positions", {
          shopId: recruitment.shopId,
          name: "既存ポジション",
          color: "#64748b",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });
        await ctx.db.patch(recruitmentId, {
          periodStart: "2026-01-10",
          periodEnd: "2026-01-12",
          deadline: "2026-01-09",
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: staffId1,
          date: "2026-01-10",
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
      });

      await expect(
        asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-10", startTime: "11:00", endTime: "19:00" }],
        }),
      ).rejects.toThrow(PAST_SHIFT_SAVE_ERROR);

      const result = await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        const assignments = await ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect();
        return { recruitment, assignments };
      });
      expect(result.recruitment?.draftSavedAt).toBeUndefined();
      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0].startTime).toBe("10:00");
    });

    it("既存の割当がある場合は全削除して置き換える", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        if (!recruitment) throw new Error("missing recruitment");
        const positionId = await ctx.db.insert("positions", {
          shopId: recruitment.shopId,
          name: "既存ポジション",
          color: "#64748b",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: staffId1,
          date: "2026-01-20",
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: staffId2,
          date: "2026-01-20",
          startTime: "11:00",
          endTime: "19:00",
          positionId,
        });
      });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "09:00", endTime: "17:00" }],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0].startTime).toBe("09:00");
    });

    it("同一スタッフ×同一日の時間が重ならない複数割当を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "14:00" },
          { staffId: staffId1, date: "2026-01-20", startTime: "15:00", endTime: "18:00" },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId1))
          .collect(),
      );
      expect(assignments).toHaveLength(2);
    });

    it("勤務区分募集では同一スタッフ×同一日の隣接する勤務区分を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "early", name: "早番", startTime: "09:00", endTime: "12:00", sortOrder: 0 },
              { id: "late", name: "遅番", startTime: "12:00", endTime: "15:00", sortOrder: 1 },
            ],
          },
        });
      });

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "09:00", endTime: "12:00", optionId: "early" },
          { staffId: staffId1, date: "2026-01-20", startTime: "12:00", endTime: "15:00", optionId: "late" },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId1))
          .collect(),
      );
      expect(assignments).toHaveLength(2);
      expect(assignments.map((assignment) => assignment.optionId).sort()).toEqual(["early", "late"]);
    });

    it("勤務区分募集では同一スタッフ×同一日の重なる別勤務区分を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "early", name: "早番", startTime: "10:00", endTime: "15:00", sortOrder: 0 },
              { id: "middle", name: "中番", startTime: "13:00", endTime: "18:00", sortOrder: 1 },
            ],
          },
        });
      });

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "15:00", optionId: "early" },
          { staffId: staffId1, date: "2026-01-20", startTime: "13:00", endTime: "18:00", optionId: "middle" },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId1))
          .collect(),
      );
      expect(assignments).toHaveLength(2);
      expect(assignments.map((assignment) => assignment.optionId).sort()).toEqual(["early", "middle"]);
    });

    it("同一スタッフ×同一日の時間が重なる割当でエラー", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [
            { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "15:00" },
            { staffId: staffId1, date: "2026-01-20", startTime: "14:00", endTime: "18:00" },
          ],
        }),
        [{ code: "OVERLAP", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("募集期間外の日付でエラー", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-27", startTime: "10:00", endTime: "18:00" }],
        }),
        [{ code: "OUT_OF_PERIOD", date: "2026-01-27", staffId: staffId1 }],
      );
    });

    it("定休日の日付ではシフト割当を保存できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t, { shopClosedDates: ["2026-01-21"] });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-21", startTime: "10:00", endTime: "18:00" }],
        }),
        [{ code: "CLOSED_DAY", date: "2026-01-21", staffId: staffId1 }],
      );
    });

    it("開始時間が終了時間以降でエラー", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "18:00", endTime: "10:00" }],
        }),
        [{ code: "INVALID_TIME_ORDER", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("開始時間と終了時間が同じでエラー", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "10:00" }],
        }),
        [{ code: "INVALID_TIME_ORDER", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("店舗のシフト時間外でエラー", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "07:00", endTime: "15:00" }],
        }),
        [{ code: "OUT_OF_BOARD_RANGE", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("分つきシフト開始時刻より前ならエラー", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: { kind: "time", startTime: "05:30", endTime: "22:30" },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "05:00", endTime: "06:30" }],
        }),
        [{ code: "OUT_OF_BOARD_RANGE", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("分つきシフト終了時刻より後ならエラー", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: { kind: "time", startTime: "05:30", endTime: "22:30" },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "21:30", endTime: "23:00" }],
        }),
        [{ code: "OUT_OF_BOARD_RANGE", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("複数の違反がある場合は全issuesをまとめて返す", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t, {
        shopClosedDates: ["2026-01-21"],
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [
            { staffId: staffId1, date: "2026-01-27", startTime: "10:00", endTime: "18:00" },
            { staffId: staffId1, date: "2026-01-21", startTime: "10:00", endTime: "18:00" },
            { staffId: staffId2, date: "2026-01-20", startTime: "07:00", endTime: "15:00" },
          ],
        }),
        [
          { code: "OUT_OF_PERIOD", date: "2026-01-27", staffId: staffId1 },
          { code: "CLOSED_DAY", date: "2026-01-21", staffId: staffId1 },
          { code: "OUT_OF_BOARD_RANGE", date: "2026-01-20", staffId: staffId2 },
        ],
      );
    });

    it("削除済みスタッフでエラー", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await setupTestData(t);

      const deletedStaffId = await t.run(async (ctx) => {
        const shop = await ctx.db.get(shopId);
        if (!shop?.organizationId) throw new Error("canonical shop not found");
        const now = Date.now();
        const organizationPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: shop.organizationId,
          name: "削除済み",
          email: "deleted@example.com",
          emailNormalized: "deleted@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        return await ctx.db.insert("staffs", {
          shopId,
          organizationId: shop.organizationId,
          organizationPersonId,
          name: "削除済み",
          email: "deleted@example.com",
          emailNormalized: "deleted@example.com",
          isDeleted: true,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          shopId,
          recruitmentId,
          assignments: [{ staffId: deletedStaffId, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
        }),
      ).rejects.toThrow(ConvexError);
    });
  });

  describe("confirmRecruitment", () => {
    // scheduler.runAfter(0, ...) による "use node" アクションがテスト環境で
    // トランザクション外書き込みエラーを起こすため、タイマーを止めて実行を抑制する
    beforeEach(() => {
      vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", "");
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-20T00:00:00+09:00"));
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    });

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await setupTestData(t);
      await expect(
        t.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
        }),
      ).rejects.toThrow();
    });

    it("正常にステータスとconfirmedAtを更新する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await setupTestData(t);

      await t
        .withIdentity({ subject: "user_manager" })
        .mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.status).toBe("confirmed");
      expect(recruitment?.confirmedAt).toBeTypeOf("number");
      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "notification/actions:sendShiftConfirmationEmails")).toHaveLength(
        1,
      );
      expect(scheduled[0].args[0]?.isResend).toBe(false);
    });

    it("過去シフトの確定通知は拒否し、通知予約しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await setupTestData(t);

      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          periodStart: "2026-01-10",
          periodEnd: "2026-01-12",
          deadline: "2026-01-09",
        });
      });

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
        }),
      ).rejects.toThrow(PAST_SHIFT_NOTIFY_ERROR);

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(recruitment?.status).toBe("open");
      expect(recruitment?.confirmedAt).toBeUndefined();
      expect(scheduled.filter((job) => job.name === CONFIRMATION_EMAIL_JOB)).toHaveLength(0);
    });

    it("確定済み募集へのconfirm intentは通知を増やさない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        recruitmentId,
        shopId,
        intent: "confirm",
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "notification/actions:sendShiftConfirmationEmails")).toHaveLength(
        1,
      );
    });

    it("確定済み募集へのresend intentは再通知として予約する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        recruitmentId,
        shopId,
        intent: "resend",
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      const confirmationJobs = scheduled.filter(
        (job) => job.name === "notification/actions:sendShiftConfirmationEmails",
      );
      expect(confirmationJobs).toHaveLength(2);
      expect(confirmationJobs.map((job) => job.args[0]?.isResend)).toEqual([false, true]);

      const analyticsEvents = await t.run(async (ctx) =>
        ctx.db
          .query("analyticsSourceEvents")
          .filter((q) => q.eq(q.field("recruitmentId"), recruitmentId))
          .collect(),
      );
      expect(analyticsEvents.map((event) => event.eventKey).toSorted()).toEqual(
        [`cycle:${recruitmentId}:confirmed:run:1`, `cycle:${recruitmentId}:confirmed:run:2`].toSorted(),
      );
    });

    it("再通知は前回通知時点から変更されたスタッフだけを対象にする", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" },
          { staffId: staffId2, date: "2026-01-20", startTime: "12:00", endTime: "20:00" },
        ],
      });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId });
      await seedCurrentConfirmationSnapshots(t, recruitmentId, [staffId1, staffId2]);
      await seedConfirmationEmailOutboxes(t, recruitmentId, [staffId1, staffId2], "sent");

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "11:00", endTime: "18:00" },
          { staffId: staffId2, date: "2026-01-20", startTime: "12:00", endTime: "20:00" },
        ],
      });
      const result = await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "resend",
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      const resendJob = scheduled
        .filter((job) => job.name === "notification/actions:sendShiftConfirmationEmails")
        .find((job) => job.args[0]?.isResend);
      expect(result).toEqual({ status: "scheduled", notifiedStaffCount: 1 });
      expect(resendJob?.args[0]?.targetStaffIds).toEqual([staffId1]);
      expect(resendJob?.args[0]?.notificationRunId).toBeTypeOf("number");
    });

    it("前回Outboxが未送信または未作成なら次の再通知へ引き継ぎ、処理中なら再確定を止める", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" },
          { staffId: staffId2, date: "2026-01-20", startTime: "12:00", endTime: "20:00" },
        ],
      });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId });
      await seedCurrentConfirmationSnapshots(t, recruitmentId, [staffId1, staffId2]);
      await seedConfirmationEmailOutboxes(t, recruitmentId, [staffId1, staffId2], "pending");

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "11:00", endTime: "18:00" },
          { staffId: staffId2, date: "2026-01-20", startTime: "12:00", endTime: "20:00" },
        ],
      });
      const result = await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "resend",
      });
      const firstResendOperation = await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        const operationKey = recruitment?.lastConfirmationNotificationOperationKey;
        if (!operationKey) return null;
        return await ctx.db
          .query("notificationFanoutOperations")
          .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
          .unique();
      });

      expect(result).toEqual({ status: "scheduled", notifiedStaffCount: 2 });
      expect(firstResendOperation?.targetStaffIds.toSorted()).toEqual([staffId1, staffId2].toSorted());

      // 直前actionがまだOutboxを作っていなくても、さらに新しいoperationから対象を落とさない。
      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "12:00", endTime: "18:00" },
          { staffId: staffId2, date: "2026-01-20", startTime: "12:00", endTime: "20:00" },
        ],
      });
      const chainedResult = await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "resend",
      });
      const latestOperation = await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        const operationKey = recruitment?.lastConfirmationNotificationOperationKey;
        if (!operationKey) return null;
        return await ctx.db
          .query("notificationFanoutOperations")
          .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
          .unique();
      });

      expect(chainedResult).toEqual({ status: "scheduled", notifiedStaffCount: 2 });
      expect(latestOperation?.operationKey).not.toBe(firstResendOperation?.operationKey);
      expect(latestOperation?.targetStaffIds.toSorted()).toEqual([staffId1, staffId2].toSorted());

      // provider呼び出し中のOutboxを新operationで追い越すと二重送信になり得るため、一時的に拒否する。
      if (!latestOperation) throw new Error("latest confirmation operation was not created");
      const [processingOutboxId] = await seedConfirmationEmailOutboxes(t, recruitmentId, [staffId1], "processing");
      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "13:00", endTime: "18:00" },
          { staffId: staffId2, date: "2026-01-20", startTime: "12:00", endTime: "20:00" },
        ],
      });

      await expect(
        asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).rejects.toThrow("前回の確定シフト通知を送信中です");
      const stateAfterBlockedResend = await t.run(async (ctx) => ({
        recruitment: await ctx.db.get(recruitmentId),
        jobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === CONFIRMATION_EMAIL_JOB,
        ),
      }));
      expect(stateAfterBlockedResend.recruitment?.lastConfirmationNotificationOperationKey).toBe(
        latestOperation.operationKey,
      );
      expect(stateAfterBlockedResend.jobs).toHaveLength(3);

      // LINE失敗後のfallbackメールもprovider呼び出し中なら、同じ境界で再確定を止める。
      if (!processingOutboxId) throw new Error("processing confirmation outbox was not created");
      await t.run(async (ctx) => {
        const now = Date.now();
        await ctx.db.patch(processingOutboxId, {
          status: "failed",
          processingStartedAt: undefined,
          failedAt: now,
          terminalAt: now,
          updatedAt: now,
        });
      });
      await seedLineConfirmationWithFallback(t, recruitmentId, staffId2, "processing");

      await expect(
        asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).rejects.toThrow("前回の確定シフト通知を送信中です");
      const jobsAfterFallbackBlockedResend = await t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === CONFIRMATION_EMAIL_JOB,
        ),
      );
      expect(jobsAfterFallbackBlockedResend).toHaveLength(3);
    });

    it("異なるmanager・requestId・時刻でも同じsemantic再送を一つのdurable operationへ収束させる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      await t.run(async (ctx) => {
        const secondManagerUserId = await seedUser(ctx, "user_manager_second", "manager-second@example.com");
        await seedLegacyShopMembership(ctx, { userId: secondManagerUserId, shopId });
      });
      const firstManager = t.withIdentity({ subject: "user_manager" });
      const secondManager = t.withIdentity({ subject: "user_manager_second" });

      await firstManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });
      await firstManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "confirm",
        requestId: "confirmation-client-first",
      });
      const confirmedOperation = await t.run(async (ctx) => await ctx.db.get(recruitmentId));
      await seedCurrentConfirmationSnapshots(t, recruitmentId, [staffId1, staffId2]);
      await seedConfirmationEmailOutboxes(t, recruitmentId, [staffId1, staffId2], "sent");

      await firstManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "11:00", endTime: "18:00" }],
      });
      vi.setSystemTime(new Date("2026-01-20T01:00:00+09:00"));
      const first = await firstManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "resend",
        requestId: "resend-client-first",
      });
      const afterFirst = await t.run(async (ctx) => await ctx.db.get(recruitmentId));

      vi.setSystemTime(new Date("2026-01-20T02:00:00+09:00"));
      const duplicate = await secondManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "resend",
        requestId: "resend-client-second",
      });
      const afterDuplicate = await t.run(async (ctx) => await ctx.db.get(recruitmentId));
      const jobsAfterDuplicate = await t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === CONFIRMATION_EMAIL_JOB && job.args[0]?.isResend,
        ),
      );

      expect(first).toEqual({ status: "scheduled", notifiedStaffCount: 1 });
      expect(duplicate).toEqual({ status: "no_changes", notifiedStaffCount: 0 });
      expect(jobsAfterDuplicate).toHaveLength(1);
      expect(afterFirst?.lastConfirmationNotificationOperationKey).not.toBe(
        confirmedOperation?.lastConfirmationNotificationOperationKey,
      );
      expect(afterDuplicate?.lastConfirmationNotificationOperationKey).toBe(
        afterFirst?.lastConfirmationNotificationOperationKey,
      );
      expect(afterDuplicate?.lastConfirmationNotificationRunId).toBe(afterFirst?.lastConfirmationNotificationRunId);
      expect(afterDuplicate?.confirmedAt).toBe(afterFirst?.confirmedAt);

      await firstManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "11:00", endTime: "18:00" },
          { staffId: staffId2, date: "2026-01-20", startTime: "12:00", endTime: "18:00" },
        ],
      });
      const changedTarget = await secondManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "resend",
        requestId: "resend-client-target-changed",
      });
      const afterTargetChange = await t.run(async (ctx) => await ctx.db.get(recruitmentId));
      expect(changedTarget).toEqual({ status: "scheduled", notifiedStaffCount: 2 });
      expect(afterTargetChange?.lastConfirmationNotificationOperationKey).not.toBe(
        afterFirst?.lastConfirmationNotificationOperationKey,
      );

      await t.run(async (ctx) => await ctx.db.patch(shopId, { name: "通知文面変更後の店舗" }));
      const changedMessage = await firstManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "resend",
        requestId: "resend-client-message-changed",
      });
      const finalState = await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        const jobs = (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === CONFIRMATION_EMAIL_JOB && job.args[0]?.isResend,
        );
        return { recruitment, jobs };
      });
      expect(changedMessage).toEqual({ status: "scheduled", notifiedStaffCount: 2 });
      expect(finalState.recruitment?.lastConfirmationNotificationOperationKey).not.toBe(
        afterTargetChange?.lastConfirmationNotificationOperationKey,
      );
      expect(finalState.jobs).toHaveLength(3);
      expect(finalState.jobs.map((job) => job.args[0]?.notificationRunId)).toEqual([2, 3, 4]);
    });

    it("再通知で変更対象がいない場合は通知を予約しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId });
      await seedCurrentConfirmationSnapshots(t, recruitmentId, [staffId1, staffId2]);
      await seedConfirmationEmailOutboxes(t, recruitmentId, [staffId1], "sent");
      await seedLineConfirmationWithFallback(t, recruitmentId, staffId2, "sent");

      const result = await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "resend",
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      const confirmationJobs = scheduled.filter(
        (job) => job.name === "notification/actions:sendShiftConfirmationEmails",
      );
      expect(result).toEqual({ status: "no_changes", notifiedStaffCount: 0 });
      expect(confirmationJobs).toHaveLength(1);
    });

    it("完了済みresendのcurrent snapshotが正しくOutboxがpendingなら補助再送を作らない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId });
      await seedCurrentConfirmationSnapshots(t, recruitmentId, [staffId1, staffId2]);
      await seedConfirmationEmailOutboxes(t, recruitmentId, [staffId1], "sent");
      await seedLineConfirmationWithFallback(t, recruitmentId, staffId2, "sent");

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "11:00", endTime: "18:00" }],
      });
      await expect(
        asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).resolves.toEqual({ status: "scheduled", notifiedStaffCount: 1 });

      await t.run(async (ctx) => {
        const snapshots = await Promise.all(
          [staffId1, staffId2].map((staffId) =>
            ctx.db
              .query("shiftConfirmationSnapshots")
              .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
              .unique(),
          ),
        );
        await Promise.all(snapshots.flatMap((snapshot) => (snapshot ? [ctx.db.delete(snapshot._id)] : [])));
      });
      await seedCurrentConfirmationSnapshots(t, recruitmentId, [staffId1, staffId2]);
      await seedConfirmationEmailOutboxes(t, recruitmentId, [staffId1], "pending");
      const completedResendOperation = await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        const operationKey = recruitment?.lastConfirmationNotificationOperationKey;
        if (!operationKey) throw new Error("completed resend operation key was not recorded");
        const operation = await ctx.db
          .query("notificationFanoutOperations")
          .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
          .unique();
        if (!operation) throw new Error("completed resend operation was not created");
        await ctx.db.patch(operation._id, {
          status: "completed",
          cursor: operation.targetStaffIds.length,
          completedAt: Date.now(),
          updatedAt: Date.now(),
          scheduledFunctionId: undefined,
        });
        return operation;
      });

      await expect(
        asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).resolves.toEqual({ status: "no_changes", notifiedStaffCount: 0 });

      const supplementalState = await t.run(async (ctx) => {
        const operations = (await ctx.db.query("notificationFanoutOperations").collect()).filter(
          (operation) => operation.supersedesActiveOperations === false,
        );
        const operationIds = new Set(operations.map((operation) => operation._id));
        const jobs = (await ctx.db.system.query("_scheduled_functions").collect()).filter((job) =>
          operationIds.has(job.args[0]?.fanoutOperationId),
        );
        return { operations, jobs };
      });
      expect(completedResendOperation.purpose).toBe("confirmation_resend");
      expect(supplementalState).toEqual({ operations: [], jobs: [] });
    });

    it("旧split snapshotは意味比較し、壊れたsignatureは再通知対象にする", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId });
      await seedCurrentConfirmationSnapshots(t, recruitmentId, [staffId1, staffId2]);
      await seedConfirmationEmailOutboxes(t, recruitmentId, [staffId1], "sent");
      await seedLineConfirmationWithFallback(t, recruitmentId, staffId2, "sent");

      const snapshotId = await t.run(async (ctx) => {
        const assignment = await ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId1))
          .unique();
        const snapshot = await ctx.db
          .query("shiftConfirmationSnapshots")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId1))
          .unique();
        if (!assignment || !snapshot) throw new Error("snapshot fixture was not created");
        const legacyAssignments = [
          {
            date: assignment.date,
            startTime: "10:00",
            endTime: "12:00",
            positionId: assignment.positionId,
          },
          {
            date: assignment.date,
            startTime: "12:00",
            endTime: "18:00",
            positionId: assignment.positionId,
          },
        ];
        await ctx.db.patch(snapshot._id, {
          assignments: legacyAssignments,
          signature: buildConfirmationSnapshotSignature(legacyAssignments),
        });
        return snapshot._id;
      });

      await expect(
        asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).resolves.toEqual({ status: "no_changes", notifiedStaffCount: 0 });

      await t.run(async (ctx) => await ctx.db.patch(snapshotId, { signature: "broken-signature" }));
      await expect(
        asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).resolves.toEqual({ status: "scheduled", notifiedStaffCount: 1 });
      const resendTargets = await t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect())
          .filter((job) => job.name === CONFIRMATION_EMAIL_JOB && job.args[0]?.isResend)
          .map((job) => job.args[0]?.targetStaffIds),
      );
      expect(resendTargets).toEqual([[staffId1]]);

      await seedConfirmationEmailOutboxes(t, recruitmentId, [staffId1], "sent");
      const completedResend = await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        const assignment = await ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId1))
          .unique();
        const snapshot = await ctx.db.get(snapshotId);
        const operationKey = recruitment?.lastConfirmationNotificationOperationKey;
        const operation = operationKey
          ? await ctx.db
              .query("notificationFanoutOperations")
              .withIndex("by_operationKey", (q) => q.eq("operationKey", operationKey))
              .unique()
          : null;
        if (!recruitment || !assignment || !snapshot || !operation) {
          throw new Error("completed resend fixture was not created");
        }
        const canonicalAssignments = [
          {
            date: assignment.date,
            startTime: assignment.startTime,
            endTime: assignment.endTime,
            positionId: assignment.positionId,
          },
        ];
        await ctx.db.patch(snapshot._id, {
          assignments: canonicalAssignments,
          signature: buildConfirmationSnapshotSignature(canonicalAssignments),
        });
        await ctx.db.patch(operation._id, {
          status: "completed",
          cursor: operation.targetStaffIds.length,
          completedAt: Date.now(),
          updatedAt: Date.now(),
          scheduledFunctionId: undefined,
        });
        return { operationId: operation._id, operationKey: operation.operationKey };
      });
      await t.run(async (ctx) => await ctx.db.patch(snapshotId, { signature: "broken-again" }));

      await expect(
        asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).resolves.toEqual({ status: "scheduled", notifiedStaffCount: 1 });
      await expect(
        asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).resolves.toEqual({ status: "no_changes", notifiedStaffCount: 0 });

      const recoveryState = await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        const supplementalOperations = (await ctx.db.query("notificationFanoutOperations").collect()).filter(
          (operation) =>
            operation.supersedesActiveOperations === false &&
            operation.confirmationOperationKeyAtOrigin === completedResend.operationKey,
        );
        const jobs = (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) =>
            job.name === CONFIRMATION_EMAIL_JOB &&
            supplementalOperations.some((operation) => operation._id === job.args[0]?.fanoutOperationId),
        );
        return { recruitment, supplementalOperations, jobs };
      });
      expect(recoveryState.recruitment?.lastConfirmationNotificationOperationKey).toBe(completedResend.operationKey);
      expect(recoveryState.supplementalOperations).toHaveLength(1);
      expect(recoveryState.supplementalOperations[0]).toMatchObject({
        purpose: "confirmation_resend",
        targetStaffIds: [staffId1],
        status: "pending",
      });
      expect(recoveryState.jobs).toHaveLength(1);
      expect(recoveryState.jobs[0]?.args[0]).toMatchObject({
        recruitmentId,
        isResend: true,
        fanoutOperationId: recoveryState.supplementalOperations[0]?._id,
      });
    });

    it("snapshotがない既存の確定済み募集では初回再通知だけ全員を対象にする", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        shopId,
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId });
      const result = await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, {
        shopId,
        recruitmentId,
        intent: "resend",
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      const resendJob = scheduled
        .filter((job) => job.name === "notification/actions:sendShiftConfirmationEmails")
        .find((job) => job.args[0]?.isResend);
      expect(result).toEqual({ status: "scheduled", notifiedStaffCount: 2 });
      expect(resendJob?.args[0]?.targetStaffIds).toEqual(expect.arrayContaining([staffId1, staffId2]));
    });

    it("過去シフトの再通知は拒否し、通知予約しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await setupTestData(t);

      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          periodStart: "2026-01-10",
          periodEnd: "2026-01-12",
          deadline: "2026-01-09",
          status: "confirmed",
          confirmedAt: 1_000,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).rejects.toThrow(PAST_SHIFT_NOTIFY_ERROR);

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(recruitment?.status).toBe("confirmed");
      expect(recruitment?.confirmedAt).toBe(1_000);
      expect(scheduled.filter((job) => job.name === CONFIRMATION_EMAIL_JOB)).toHaveLength(0);
    });

    it("未確定募集へのresend intentはエラー", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId } = await setupTestData(t);

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
          intent: "resend",
        }),
      ).rejects.toThrow("確定シフトだけ再送できます");
    });

    it("定休日に既存シフトが残っている場合は確定できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId1 } = await setupTestData(t, { shopClosedDates: ["2026-01-21"] });
      await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        if (!recruitment) throw new Error("missing recruitment");
        const positionId = await ctx.db.insert("positions", {
          shopId: recruitment.shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: staffId1,
          date: "2026-01-21",
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.confirmRecruitment, {
          shopId,
          recruitmentId,
        }),
        [{ code: "CLOSED_DAY", date: "2026-01-21", staffId: staffId1 }],
      );
    });

    it("他店舗のrecruitmentではNot foundエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      const otherShopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_other2",
          email: "other2@example.com",
          shopName: "他店舗",
        });
        return seeded.shopId;
      });

      await expect(
        t
          .withIdentity({ subject: "user_other2" })
          .mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, shopId: otherShopId }),
      ).rejects.toThrow(ConvexError);
    });
  });
});
