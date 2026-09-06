import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import {
  generateDateRange,
  getDeadlineCutoff,
  getManagerConfirmationReminderAt,
  getReminderScheduledAt,
  getSubmitLinkCutoff,
  todayJST,
} from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";
import {
  assertRecruitmentEditVersion,
  getRecruitmentEditVersion,
  isCurrentSubmission,
} from "../_lib/recruitmentEditing";
import { isValidIsoDateString } from "../_lib/validation";
import {
  NOTIFICATION_FANOUT_SCOPE_LIMIT,
  RECRUITMENT_DUPLICATE_SCAN_LIMIT,
  SHIFT_ASSIGNMENT_LIMIT,
  SHIFT_BOARD_SHIFT_REQUEST_LIMIT,
  SHIFT_BOARD_STAFF_LIMIT,
} from "../constants";
import {
  cancelNotificationFanoutOperationsForRecruitment,
  ensureNotificationFanoutOperation,
} from "../notification/fanout";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { isShiftTargetStaff } from "../staff/service";
import { type CreateRecruitmentInput, createRecruitmentSchema } from "./schemas";
import { getActiveRecruitmentInShop } from "./service";

const RECRUITMENT_DUPLICATE_ERROR_CODE = "RECRUITMENT_DUPLICATE";

function normalizeShopClosedDates(dates: string[], periodStart: string, periodEnd: string): string[] {
  const uniqueDates = [...new Set(dates)].sort();
  const periodDateCount = generateDateRange(periodStart, periodEnd).length;

  for (const date of uniqueDates) {
    if (!isValidIsoDateString(date)) {
      throw new ConvexError("定休日の日付形式が正しくありません。");
    }
    if (date < periodStart || date > periodEnd) {
      throw new ConvexError("定休日は募集期間内の日付から選んでください。");
    }
  }

  if (periodDateCount > 0 && uniqueDates.length >= periodDateCount) {
    throw new ConvexError("シフト期間のすべての日を定休日にすることはできません。");
  }

  return uniqueDates;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parseRecruitmentDates(args: CreateRecruitmentInput) {
  const parsed = createRecruitmentSchema.safeParse(args);
  if (!parsed.success) {
    throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }
  const input = parsed.data;
  const today = todayJST();
  if (input.deadline < today) throw new ConvexError("提出期限は今日以降にしてください");
  if (input.periodStart <= today) throw new ConvexError("開始日は明日以降にしてください");
  return {
    ...input,
    shopClosedDates: normalizeShopClosedDates(input.shopClosedDates, input.periodStart, input.periodEnd),
  };
}

export const createRecruitment = managerMutation({
  args: {
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
    shopClosedDates: v.array(v.string()),
  },
  returns: v.id("recruitments"),
  handler: async (ctx, args) => {
    const input = parseRecruitmentDates(args);
    const shopClosedDates = input.shopClosedDates;
    const existingRecruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ctx.shop._id).eq("isDeleted", false))
      .take(RECRUITMENT_DUPLICATE_SCAN_LIMIT);
    const duplicate = existingRecruitments.find(
      (candidate) =>
        candidate.periodStart === input.periodStart &&
        candidate.periodEnd === input.periodEnd &&
        candidate.deadline === input.deadline &&
        sameStringArray(candidate.shopClosedDates, shopClosedDates),
    );
    if (duplicate) throw new ConvexError(RECRUITMENT_DUPLICATE_ERROR_CODE);

    const now = Date.now();
    const reminderScheduledAt = getReminderScheduledAt(input.deadline);
    const shouldScheduleReminder = reminderScheduledAt > now;

    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: ctx.shop._id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      deadline: input.deadline,
      shopClosedDates,
      status: "open",
      isDeleted: false,
      // 作成時点の店舗シフト時間帯をスナップショットとして保存
      submissionPattern: ctx.shop.submissionPattern,
      ...(shouldScheduleReminder ? { reminderScheduledAt } : {}),
    });
    const activeStaffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ctx.shop._id).eq("isDeleted", false))
      .take(NOTIFICATION_FANOUT_SCOPE_LIMIT + 1);
    if (activeStaffs.length > NOTIFICATION_FANOUT_SCOPE_LIMIT) {
      throw new ConvexError("通知対象が上限を超えています");
    }
    await ctx.db.insert("recruitmentStats", {
      recruitmentId,
      shopId: ctx.shop._id,
      submittedCount: 0,
      activeStaffCountSnapshot: activeStaffs.length,
      updatedAt: now,
    });
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });
    const { operation: fanoutOperation } = await ensureNotificationFanoutOperation(ctx, {
      operationKey: `shift.recruitment:v1:${recruitmentId}`,
      kind: "recruitment",
      purpose: "recruitment",
      recruitmentId,
      shopId: ctx.shop._id,
      targetStaffIds: activeStaffs.filter(isShiftTargetStaff).map((staff) => staff._id),
      dedupeSuffix: "recruitment",
      ...notificationOrigin,
    });

    // 募集作成はDB更新を先に完了させ、通知は action 側で LINE / email / dry-run を振り分ける。
    const fanoutScheduledFunctionId = await ctx.scheduler.runAfter(
      0,
      internal.notification.actions.sendRecruitmentNotificationEmails,
      {
        recruitmentId,
        fanoutOperationId: fanoutOperation._id,
        ...notificationOrigin,
      },
    );
    await ctx.db.patch(fanoutOperation._id, { scheduledFunctionId: fanoutScheduledFunctionId });
    if (shouldScheduleReminder) {
      await ctx.scheduler.runAt(reminderScheduledAt, internal.notification.reminderActions.sendReminderEmails, {
        recruitmentId,
        ...notificationOrigin,
      });
    }

    // 提出期限の翌日17時に、まだ確定していなければマネージャーへ確定催促を送る。
    const confirmationReminderAt = getManagerConfirmationReminderAt(input.deadline);
    if (confirmationReminderAt > now) {
      await ctx.scheduler.runAt(
        confirmationReminderAt,
        internal.shiftConfirmationReminder.actions.sendManagerConfirmationReminder,
        { recruitmentId, ...notificationOrigin },
      );
    }

    return recruitmentId;
  },
});

export const updateRecruitment = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    expectedEditVersion: v.number(),
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
    shopClosedDates: v.array(v.string()),
  },
  returns: v.object({ changed: v.boolean(), requiresResubmission: v.boolean() }),
  handler: async (ctx, args) => {
    const recruitment = await getActiveRecruitmentInShop(ctx, ctx.shop._id, args.recruitmentId);
    if (!recruitment) throw new ConvexError("Not found");
    const now = Date.now();
    if (
      recruitment.status !== "open" ||
      now >= getSubmitLinkCutoff(recruitment.periodStart) ||
      now >= getDeadlineCutoff(recruitment.deadline)
    ) {
      throw new ConvexError("この募集は編集できません。");
    }
    assertRecruitmentEditVersion(recruitment, args.expectedEditVersion);
    const input = parseRecruitmentDates(args);
    const previousClosedDates = [...new Set(recruitment.shopClosedDates)].sort();
    if (
      recruitment.periodStart === input.periodStart &&
      recruitment.periodEnd === input.periodEnd &&
      recruitment.deadline === input.deadline &&
      sameStringArray(previousClosedDates, input.shopClosedDates)
    ) {
      return { changed: false, requiresResubmission: false };
    }

    const previousWorkingDates = new Set(
      generateDateRange(recruitment.periodStart, recruitment.periodEnd).filter(
        (date) => !previousClosedDates.includes(date),
      ),
    );
    const workingDates = new Set(
      generateDateRange(input.periodStart, input.periodEnd).filter((date) => !input.shopClosedDates.includes(date)),
    );
    const requiresResubmission = [...workingDates].some((date) => !previousWorkingDates.has(date));
    const [submissions, slots, dates, assignments, activeStaffs] = await Promise.all([
      ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(SHIFT_BOARD_STAFF_LIMIT + 1),
      ctx.db
        .query("shiftSubmissionSlots")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT + 1),
      ctx.db
        .query("shiftSubmissionDates")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT + 1),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(SHIFT_ASSIGNMENT_LIMIT + 1),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ctx.shop._id).eq("isDeleted", false))
        .take(NOTIFICATION_FANOUT_SCOPE_LIMIT + 1),
    ]);
    if (
      submissions.length > SHIFT_BOARD_STAFF_LIMIT ||
      slots.length > SHIFT_BOARD_SHIFT_REQUEST_LIMIT ||
      dates.length > SHIFT_BOARD_SHIFT_REQUEST_LIMIT ||
      assignments.length > SHIFT_ASSIGNMENT_LIMIT ||
      activeStaffs.length > NOTIFICATION_FANOUT_SCOPE_LIMIT
    ) {
      throw new ConvexError("募集に関連するデータが上限を超えているため、編集できません。");
    }

    // 対象外の希望と割当は削除する。再拡張しても、以前の内容を復活させない。
    await Promise.all([
      ...slots.filter((entry) => !workingDates.has(entry.date)).map((entry) => ctx.db.delete(entry._id)),
      ...dates.filter((entry) => !workingDates.has(entry.date)).map((entry) => ctx.db.delete(entry._id)),
      ...assignments.filter((entry) => !workingDates.has(entry.date)).map((entry) => ctx.db.delete(entry._id)),
      ...(requiresResubmission
        ? submissions.map((submission) => ctx.db.patch(submission._id, { needsResubmission: true }))
        : []),
    ]);

    const editVersion = getRecruitmentEditVersion(recruitment) + 1;
    const reminderScheduledAt = getReminderScheduledAt(input.deadline);
    const shouldScheduleReminder = reminderScheduledAt > now;
    await ctx.db.patch(recruitment._id, {
      ...input,
      editVersion,
      reminderScheduledAt: shouldScheduleReminder ? reminderScheduledAt : undefined,
      lastReminderSentAt: undefined,
    });
    const targetStaffIds = activeStaffs.filter(isShiftTargetStaff).map((staff) => staff._id);
    const targetStaffSet = new Set(targetStaffIds);
    const submittedCount = requiresResubmission
      ? 0
      : submissions.filter((submission) => targetStaffSet.has(submission.staffId) && isCurrentSubmission(submission))
          .length;
    const stats = await ctx.db
      .query("recruitmentStats")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
      .unique();
    const statsValues = { submittedCount, activeStaffCountSnapshot: targetStaffIds.length, updatedAt: now };
    if (stats) await ctx.db.patch(stats._id, statsValues);
    else
      await ctx.db.insert("recruitmentStats", { recruitmentId: recruitment._id, shopId: ctx.shop._id, ...statsValues });

    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });
    const { operation } = await ensureNotificationFanoutOperation(ctx, {
      operationKey: `shift.recruitment.update:v1:${recruitment._id}:${editVersion}`,
      kind: "recruitment",
      purpose: "recruitment_update",
      recruitmentUpdate: {
        before: {
          periodStart: recruitment.periodStart,
          periodEnd: recruitment.periodEnd,
          deadline: recruitment.deadline,
          shopClosedDates: previousClosedDates,
        },
        after: input,
      },
      recruitmentId: recruitment._id,
      shopId: ctx.shop._id,
      targetStaffIds,
      dedupeSuffix: `recruitment_update:${editVersion}`,
      ...notificationOrigin,
    });
    const scheduledFunctionId = await ctx.scheduler.runAfter(
      0,
      internal.notification.actions.sendRecruitmentNotificationEmails,
      {
        recruitmentId: recruitment._id,
        fanoutOperationId: operation._id,
        ...notificationOrigin,
      },
    );
    await ctx.db.patch(operation._id, { scheduledFunctionId });
    if (shouldScheduleReminder) {
      await ctx.scheduler.runAt(reminderScheduledAt, internal.notification.reminderActions.sendReminderEmails, {
        recruitmentId: recruitment._id,
        recruitmentVersionAtOrigin: editVersion,
        ...notificationOrigin,
      });
    }
    const confirmationReminderAt = getManagerConfirmationReminderAt(input.deadline);
    if (confirmationReminderAt > now) {
      await ctx.scheduler.runAt(
        confirmationReminderAt,
        internal.shiftConfirmationReminder.actions.sendManagerConfirmationReminder,
        {
          recruitmentId: recruitment._id,
          recruitmentVersionAtOrigin: editVersion,
          ...notificationOrigin,
        },
      );
    }
    return { changed: true, requiresResubmission };
  },
});

export const deleteRecruitment = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recruitment = await getActiveRecruitmentInShop(ctx, ctx.shop._id, args.recruitmentId);
    if (!recruitment) {
      throw new ConvexError("Not found");
    }

    // 周辺データは監査のため残し、募集を失効させて提出/閲覧/通知導線から外す。
    await ctx.db.patch(args.recruitmentId, { isDeleted: true });
    await cancelNotificationFanoutOperationsForRecruitment(ctx, args.recruitmentId);
    return null;
  },
});
