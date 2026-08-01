import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { seedManagerShop, seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getFeatureRequestsRef, getShopRecruitmentsRef, getShopStagesRef } from "./refs";
import { ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT } from "./schemas";

function setup() {
  return convexTest(schema, modules);
}

function recruitmentInput(
  shopId: Id<"shops">,
  overrides: Partial<Doc<"recruitments">> = {},
): Omit<Doc<"recruitments">, "_creationTime" | "_id"> {
  return {
    deadline: "2026-07-01",
    isDeleted: false,
    periodEnd: "2026-07-14",
    periodStart: "2026-07-08",
    shopClosedDates: [],
    shopId,
    status: "open",
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
    ...overrides,
  };
}

function shopSnapshotInput(
  shopId: Id<"shops">,
  overrides: Partial<Doc<"analyticsDailyShopSnapshots">> = {},
): Omit<Doc<"analyticsDailyShopSnapshots">, "_creationTime" | "_id"> {
  return {
    computedAt: Date.now() + 1000,
    date: "2026-07-08",
    lineFollowingStaffCount: 0,
    lineLinkedStaffCount: 0,
    openRecruitmentCount: 1,
    planKey: "free",
    shopId,
    shiftTargetStaffCount: 0,
    staffCount: 0,
    ...overrides,
  };
}

type NotificationPayload = Doc<"notificationOutbox">["payload"];
type NotificationEmailPayload = Extract<NotificationPayload, { kind: "email" }>;
type NotificationLinePayload = Extract<NotificationPayload, { kind: "line" }>;

function reminderEmailPayload(overrides: Partial<NotificationEmailPayload> = {}): NotificationEmailPayload {
  return {
    context: "notification.sendReminderEmails",
    from: "Shiftori <noreply@example.com>",
    html: "<p>催促</p>",
    kind: "email",
    subject: "シフト希望の提出期限が近づいています",
    to: "staff@example.com",
    ...overrides,
  };
}

function reminderLinePayload(overrides: Partial<NotificationLinePayload> = {}): NotificationLinePayload {
  return {
    kind: "line",
    text: "シフト希望の提出期限が近づいています",
    toUserId: "line-user-id",
    ...overrides,
  };
}

function sentNotificationOutboxInput(
  shopId: Id<"shops">,
  staffId: Id<"staffs">,
  overrides: Partial<Omit<Doc<"notificationOutbox">, "_creationTime" | "_id" | "shopId" | "staffId">> = {},
): Omit<Doc<"notificationOutbox">, "_creationTime" | "_id"> {
  const now = Date.now();
  return {
    attemptCount: 1,
    channel: "email",
    createdAt: now,
    dedupeKey: `email:reminder:test:${staffId}`,
    nextRunAt: now,
    payload: reminderEmailPayload(),
    sentAt: now,
    shopId,
    staffId,
    status: "sent",
    updatedAt: now,
    ...overrides,
  };
}

describe("analyticsDashboard/queries", () => {
  it("要望を新しい順にページングし、メールアドレスを返さない", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const first = await seedManagerShop(ctx, {
        subject: "analytics_feature_first",
        email: "first@example.com",
        shopName: "最初の店舗",
      });
      const second = await seedManagerShop(ctx, {
        subject: "analytics_feature_second",
        email: "second@example.com",
        shopName: "次の店舗",
      });
      await ctx.db.insert("featureRequests", {
        shopId: first.shopId,
        userId: first.userId,
        comment: "古い要望",
        requestId: "8ca40779-a0b3-4185-99ef-38d42ea35618",
      });
      await ctx.db.insert("featureRequests", {
        shopId: second.shopId,
        userId: second.userId,
        comment: "新しい要望",
        requestId: "86320607-e172-4df6-9770-eec6394f65aa",
      });
    });

    const firstPage = await t.query(getFeatureRequestsRef, { cursor: null, limit: 1 });
    expect(firstPage.rows).toHaveLength(1);
    expect(firstPage.rows[0]).toMatchObject({
      comment: "新しい要望",
      shopName: "次の店舗",
      senderType: "manager",
    });
    expect(firstPage.rows[0]).not.toHaveProperty("email");
    expect(firstPage.rows[0]).not.toHaveProperty("userName");
    expect(firstPage.rows[0]).not.toHaveProperty("senderId");
    expect(firstPage.isDone).toBe(false);

    const secondPage = await t.query(getFeatureRequestsRef, { cursor: firstPage.continueCursor, limit: 1 });
    expect(secondPage.rows).toHaveLength(1);
    expect(secondPage.rows[0]).toMatchObject({ comment: "古い要望", shopName: "最初の店舗" });
    expect(secondPage.isDone).toBe(true);
  });

  it("スタッフからの要望は送信者種別だけを返す", async () => {
    const t = setup();
    const { shopId } = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "スタッフ要望店舗");
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "スタッフ名は返さない",
        email: "staff@example.com",
        isDeleted: false,
      });
      await ctx.db.insert("featureRequests", {
        shopId,
        staffId,
        comment: "スタッフからの要望",
        requestId: "12ac7915-4341-4cd4-93ca-e1cbdbfe6b48",
      });
      return { shopId };
    });

    const result = await t.query(getFeatureRequestsRef, { cursor: null, limit: 50 });

    expect(result.rows[0]).toMatchObject({
      shopId,
      shopName: "スタッフ要望店舗",
      senderType: "staff",
      comment: "スタッフからの要望",
    });
    expect(result.rows[0]).not.toHaveProperty("userName");
    expect(result.rows[0]).not.toHaveProperty("senderId");
  });

  it("店舗別シフト履歴を期間の新しい順に返し、削除済み募集を除外する", async () => {
    const t = setup();
    const { newerRecruitment, olderRecruitment, shopId } = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "ローカル店舗");
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("staffs", {
          email: `staff${i}@example.com`,
          isDeleted: false,
          name: `スタッフ${i}`,
          shopId,
        });
      }
      const olderRecruitment = await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, { deadline: "2026-06-01", periodEnd: "2026-06-14", periodStart: "2026-06-08" }),
      );
      const newerRecruitment = await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, {
          confirmedAt: Date.now(),
          deadline: "2026-07-05",
          periodEnd: "2026-07-14",
          periodStart: "2026-07-08",
          status: "confirmed",
        }),
      );
      await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, { isDeleted: true, periodEnd: "2026-08-14", periodStart: "2026-08-08" }),
      );
      await ctx.db.insert("recruitmentStats", {
        activeStaffCountSnapshot: 5,
        recruitmentId: newerRecruitment,
        shopId,
        submittedCount: 3,
        updatedAt: Date.now(),
      });

      return { newerRecruitment, olderRecruitment, shopId };
    });

    const result = await t.query(getShopRecruitmentsRef, { shopId });

    expect(result.shopName).toBe("ローカル店舗");
    expect(result.rows.map((row) => row.recruitmentId)).toEqual([newerRecruitment, olderRecruitment]);
    expect(result.rows[0]).toMatchObject({
      currentShiftTargetStaffCount: 5,
      deadline: "2026-07-05",
      status: "confirmed",
      submittedCount: 3,
    });
    expect(result.rows).toHaveLength(2);
  });

  it("店舗別シフト履歴の提出母数は現在のシフト対象スタッフ数を返す", async () => {
    const t = setup();
    const { recruitmentId, shopId } = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "追加スタッフ店舗");
      const recruitmentId = await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, { periodEnd: "2026-07-15", periodStart: "2026-07-01" }),
      );
      for (let i = 0; i < 21; i++) {
        await ctx.db.insert("staffs", {
          email: `current${i}@example.com`,
          isDeleted: false,
          name: `現在スタッフ${i}`,
          shopId,
        });
      }
      await ctx.db.insert("staffs", {
        email: "deleted@example.com",
        isDeleted: true,
        name: "削除済みスタッフ",
        shopId,
      });
      await ctx.db.insert("staffs", {
        email: "excluded@example.com",
        excludedFromShift: true,
        isDeleted: false,
        name: "対象外スタッフ",
        shopId,
      });
      await ctx.db.insert("recruitmentStats", {
        activeStaffCountSnapshot: 3,
        recruitmentId,
        shopId,
        submittedCount: 25,
        updatedAt: Date.now(),
      });

      return { recruitmentId, shopId };
    });

    const result = await t.query(getShopRecruitmentsRef, { shopId });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      currentShiftTargetStaffCount: 21,
      recruitmentId,
      submittedCount: 21,
    });
  });

  it("ステージ表は現在の業務データを再走査せず日次snapshotの提出率を返す", async () => {
    const t = setup();
    const { shopId } = await t.run(async (ctx) => {
      const now = Date.now();
      const shopId = await seedShop(ctx, "提出率店舗");
      const recruitmentId = await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, { periodEnd: "2026-07-15", periodStart: "2026-07-01" }),
      );
      for (let i = 0; i < 22; i++) {
        await ctx.db.insert("staffs", {
          email: `current-rate${i}@example.com`,
          isDeleted: false,
          name: `現在スタッフ${i}`,
          shopId,
        });
      }
      await ctx.db.insert("staffs", {
        email: "excluded-rate@example.com",
        excludedFromShift: true,
        isDeleted: false,
        name: "対象外スタッフ",
        shopId,
      });
      await ctx.db.insert("recruitmentStats", {
        activeStaffCountSnapshot: 1,
        recruitmentId,
        shopId,
        submittedCount: 25,
        updatedAt: now,
      });
      await ctx.db.insert(
        "analyticsDailyShopSnapshots",
        shopSnapshotInput(shopId, {
          computedAt: now + 1000,
          hasCurrentConfirmedShift: false,
          hasCurrentOrFutureConfirmedShift: false,
          hasFutureOpenRecruitment: true,
          hasSubmission: true,
          openRecruitmentCount: 1,
          recruitmentCount: 1,
          shiftTargetStaffCount: 22,
          stage: "activeTrial",
          staffCount: 22,
          submissionRate: 0.75,
          lastRecruitmentSubmissionRate: 0.5,
          lastShiftSubmissionRate: 0.25,
        }),
      );

      return { shopId };
    });

    const result = await t.query(getShopStagesRef, { date: "2026-07-08" });
    const row = result.rows.find((candidate) => candidate.shopId === shopId);

    expect(row?.submissionRate).toBe(0.75);
    expect(row?.confirmedSubmissionRate).toBeNull();
    expect(row?.lastRecruitmentSubmissionRate).toBe(0.5);
    expect(row?.lastShiftSubmissionRate).toBe(0.25);
  });

  it("ステージ表の確定済み提出率は募集中シフトを含めない", async () => {
    const t = setup();
    const { shopId } = await t.run(async (ctx) => {
      const now = Date.now();
      const shopId = await seedShop(ctx, "運用中提出率店舗");
      const confirmedRecruitmentId = await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, {
          confirmedAt: now,
          periodEnd: "2026-07-08",
          periodStart: "2026-07-08",
          status: "confirmed",
        }),
      );
      const openRecruitmentId = await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, { periodEnd: "2026-07-15", periodStart: "2026-07-09" }),
      );
      for (let i = 0; i < 10; i++) {
        await ctx.db.insert("staffs", {
          email: `retained-rate${i}@example.com`,
          isDeleted: false,
          name: `運用中スタッフ${i}`,
          shopId,
        });
      }
      await ctx.db.insert("recruitmentStats", {
        activeStaffCountSnapshot: 10,
        recruitmentId: confirmedRecruitmentId,
        shopId,
        submittedCount: 8,
        updatedAt: now,
      });
      await ctx.db.insert("recruitmentStats", {
        activeStaffCountSnapshot: 10,
        recruitmentId: openRecruitmentId,
        shopId,
        submittedCount: 2,
        updatedAt: now,
      });
      await ctx.db.insert(
        "analyticsDailyShopSnapshots",
        shopSnapshotInput(shopId, {
          computedAt: now + 1000,
          confirmedRecruitmentCount: 1,
          hasCurrentConfirmedShift: true,
          hasCurrentOrFutureConfirmedShift: true,
          hasFutureOpenRecruitment: true,
          hasSubmission: true,
          openRecruitmentCount: 1,
          recruitmentCount: 2,
          shiftTargetStaffCount: 10,
          stage: "retained",
          staffCount: 10,
          submissionRate: 0.5,
          confirmedSubmissionRate: 0.8,
        }),
      );

      return { shopId };
    });

    const result = await t.query(getShopStagesRef, { date: "2026-07-08" });
    const row = result.rows.find((candidate) => candidate.shopId === shopId);

    expect(row?.submissionRate).toBe(0.5);
    expect(row?.confirmedSubmissionRate).toBe(0.8);
  });

  it("ステージ表は催促送信スタッフ率も日次snapshotから返す", async () => {
    const t = setup();
    const { shopId } = await t.run(async (ctx) => {
      const now = Date.now();
      const shopId = await seedShop(ctx, "催促スタッフ率店舗");
      const recruitmentId = await ctx.db.insert(
        "recruitments",
        recruitmentInput(shopId, {
          confirmedAt: now,
          periodEnd: "2026-07-08",
          periodStart: "2026-07-08",
          status: "confirmed",
        }),
      );
      const currentStaffIds: Id<"staffs">[] = [];
      for (let i = 0; i < 4; i++) {
        currentStaffIds.push(
          await ctx.db.insert("staffs", {
            email: `reminder-rate${i}@example.com`,
            isDeleted: false,
            name: `催促対象スタッフ${i}`,
            shopId,
          }),
        );
      }
      const excludedStaffId = await ctx.db.insert("staffs", {
        email: "reminder-excluded@example.com",
        excludedFromShift: true,
        isDeleted: false,
        name: "シフト対象外スタッフ",
        shopId,
      });
      const deletedStaffId = await ctx.db.insert("staffs", {
        email: "reminder-deleted@example.com",
        isDeleted: true,
        name: "削除済みスタッフ",
        shopId,
      });

      await ctx.db.insert(
        "notificationOutbox",
        sentNotificationOutboxInput(shopId, currentStaffIds[0], {
          dedupeKey: `email:reminder:${recruitmentId}:${currentStaffIds[0]}`,
          recruitmentId,
          sentAt: now,
        }),
      );
      await ctx.db.insert(
        "notificationOutbox",
        sentNotificationOutboxInput(shopId, currentStaffIds[0], {
          dedupeKey: `email:failureRetryReminder:${recruitmentId}:${currentStaffIds[0]}:${now}`,
          recruitmentId,
          sentAt: now,
        }),
      );
      await ctx.db.insert(
        "notificationOutbox",
        sentNotificationOutboxInput(shopId, currentStaffIds[1], {
          channel: "line",
          dedupeKey: `line:reminder:${recruitmentId}:${currentStaffIds[1]}`,
          payload: reminderLinePayload(),
          recruitmentId,
          sentAt: now,
        }),
      );
      await ctx.db.insert(
        "notificationOutbox",
        sentNotificationOutboxInput(shopId, currentStaffIds[2], {
          dedupeKey: `email:recruitment:${recruitmentId}:${currentStaffIds[2]}`,
          payload: reminderEmailPayload({ context: "notification.sendOpenRecruitmentNotificationsForStaff" }),
          recruitmentId,
          sentAt: now,
        }),
      );
      await ctx.db.insert(
        "notificationOutbox",
        sentNotificationOutboxInput(shopId, currentStaffIds[2], {
          dedupeKey: `email:reminder:${recruitmentId}:${currentStaffIds[2]}:suppressed`,
          payload: reminderEmailPayload({ suppressDelivery: true }),
          recruitmentId,
          sentAt: now,
        }),
      );
      await ctx.db.insert(
        "notificationOutbox",
        sentNotificationOutboxInput(shopId, currentStaffIds[2], {
          dedupeKey: `email:reminder:${recruitmentId}:${currentStaffIds[2]}:failed`,
          recruitmentId,
          status: "failed",
        }),
      );
      await ctx.db.insert(
        "notificationOutbox",
        sentNotificationOutboxInput(shopId, currentStaffIds[2], {
          dedupeKey: `email:reminder:${recruitmentId}:${currentStaffIds[2]}:future`,
          recruitmentId,
          sentAt: now + 1,
        }),
      );
      await ctx.db.insert(
        "notificationOutbox",
        sentNotificationOutboxInput(shopId, excludedStaffId, {
          dedupeKey: `email:reminder:${recruitmentId}:${excludedStaffId}`,
          recruitmentId,
          sentAt: now,
        }),
      );
      await ctx.db.insert(
        "notificationOutbox",
        sentNotificationOutboxInput(shopId, deletedStaffId, {
          dedupeKey: `email:reminder:${recruitmentId}:${deletedStaffId}`,
          recruitmentId,
          sentAt: now,
        }),
      );
      await ctx.db.insert(
        "analyticsDailyShopSnapshots",
        shopSnapshotInput(shopId, {
          computedAt: now + 1000,
          confirmedRecruitmentCount: 1,
          hasCurrentConfirmedShift: true,
          hasCurrentOrFutureConfirmedShift: true,
          hasFutureOpenRecruitment: false,
          hasSubmission: true,
          openRecruitmentCount: 0,
          recruitmentCount: 1,
          shiftTargetStaffCount: 4,
          staffCount: 6,
          stage: "retained",
          stageReferenceAt: now,
          reminderSentStaffRate: 0.5,
        }),
      );

      return { shopId };
    });

    const result = await t.query(getShopStagesRef, { date: "2026-07-08" });
    const row = result.rows.find((candidate) => candidate.shopId === shopId);

    expect(row?.reminderSentStaffRate).toBe(0.5);
  });

  it("日次snapshotが走査上限を超える場合は一部店舗を返さずfail-closedにする", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "容量上限検証店舗");
      for (let index = 0; index <= ANALYTICS_DASHBOARD_SHOP_SCAN_LIMIT; index += 1) {
        await ctx.db.insert(
          "analyticsDailyShopSnapshots",
          shopSnapshotInput(shopId, { computedAt: Date.now() + index }),
        );
      }
    });

    await expect(t.query(getShopStagesRef, { date: "2026-07-08" })).rejects.toThrow(
      "Analytics shop snapshot page limit exceeded",
    );
  });
});
