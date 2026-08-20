import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isShopParentActive } from "../_lib/activeShop";
import {
  formatDateLabel,
  formatPeriodLabel,
  generateDateRange,
  getDeadlineCutoff,
  getSubmitLinkCutoff,
  todayJST,
} from "../_lib/dateFormat";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { normalizeExactAdjacentTimeAssignments } from "../_lib/shiftAssignmentNormalization";
import { buildShiftTimeLabel } from "../_lib/time";
import { normalizeEmail } from "../_lib/validation";
import {
  CURRENT_SHIFT_NOTIFICATION_LIMIT,
  NOTIFICATION_FANOUT_SCOPE_LIMIT,
  OPEN_RECRUITMENT_NOTIFICATION_LIMIT,
  SHIFT_ASSIGNMENT_LIMIT,
} from "../constants";
import { resolveStaffLineRecipient } from "../line/service";
import { type NotificationLineRecipient, toNotificationLineRecipient } from "../notificationOutbox/types";
import { isShiftTargetStaff } from "../staff/service";
import {
  buildConfirmationSnapshotSignature,
  type ConfirmationSnapshotAssignment,
  canonicalizeConfirmationSnapshotAssignments,
  normalizeConfirmationSnapshotAssignments,
} from "./confirmationSnapshots";

type AssignmentTime = {
  startTime: string;
  endTime: string;
  optionId?: string;
};

type ConfirmationStaffEntry = {
  staffId: Id<"staffs">;
  name: string;
  email: string;
  lineUserId?: string;
  lineFollowing?: boolean;
  lineRecipient: NotificationLineRecipient | null;
  shifts: { date: string; timeLabel: string | null }[];
  snapshotAssignments: ConfirmationSnapshotAssignment[];
  snapshotSignature: string;
};

async function resolveLineRecipientSnapshot(
  ctx: QueryCtx,
  staff: Pick<Doc<"staffs">, "_id" | "shopId">,
): Promise<NotificationLineRecipient | null> {
  const recipient = await resolveStaffLineRecipient(ctx, { staffId: staff._id, shopId: staff.shopId });
  return toNotificationLineRecipient(recipient);
}

async function getConfirmationAssignments(
  ctx: QueryCtx,
  recruitmentId: Id<"recruitments">,
  targetStaffIds?: readonly Id<"staffs">[],
) {
  if (!targetStaffIds) {
    const assignments = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .take(SHIFT_ASSIGNMENT_LIMIT + 1);
    if (assignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new Error("Shift assignment scope exceeds the supported limit");
    }
    return assignments;
  }

  const assignments: Doc<"shiftAssignments">[] = [];
  let remainingAssignmentCapacity = SHIFT_ASSIGNMENT_LIMIT;
  for (const staffId of new Set(targetStaffIds)) {
    const staffAssignments = await ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId))
      .take(remainingAssignmentCapacity + 1);
    if (staffAssignments.length > remainingAssignmentCapacity) {
      throw new Error("Shift assignment scope exceeds the supported limit");
    }
    assignments.push(...staffAssignments);
    remainingAssignmentCapacity -= staffAssignments.length;
  }
  return assignments;
}

async function buildConfirmationStaffEntries(
  ctx: QueryCtx,
  recruitment: Doc<"recruitments">,
  staffs: Doc<"staffs">[],
  assignments: Doc<"shiftAssignments">[],
  knownLineRecipient?: NotificationLineRecipient | null,
): Promise<ConfirmationStaffEntry[]> {
  const dates = generateDateRange(recruitment.periodStart, recruitment.periodEnd);
  // TODO[narrow]: 全deploymentでm040が完走し、
  // verifyRecruitments.missingShopClosedDatesが0件になった後にfallbackを削除する。
  const shopClosedDateSet = new Set(recruitment.shopClosedDates ?? []);
  const submissionPattern = recruitment.submissionPattern;
  const projectedAssignments =
    submissionPattern.kind === "time" ? normalizeExactAdjacentTimeAssignments(assignments) : assignments;

  return Promise.all(
    staffs.map(async (staff) => {
      const staffAssignments = projectedAssignments.filter((a) => a.staffId === staff._id);
      const assignmentsByDate = new Map<string, AssignmentTime[]>();
      for (const assignment of staffAssignments) {
        const items = assignmentsByDate.get(assignment.date) ?? [];
        items.push({
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
        });
        assignmentsByDate.set(assignment.date, items);
      }
      const lineRecipient =
        knownLineRecipient && staffs.length === 1 ? knownLineRecipient : await resolveLineRecipientSnapshot(ctx, staff);

      const shifts = dates.map((date) => {
        const timeLabel = shopClosedDateSet.has(date)
          ? "定休日"
          : buildShiftTimeLabel(assignmentsByDate.get(date) ?? [], submissionPattern);
        return {
          date: formatDateLabel(date),
          timeLabel,
        };
      });
      const rawSnapshotAssignments = staffAssignments.map((assignment) => ({
        date: assignment.date,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        positionId: assignment.positionId,
        ...(assignment.optionId !== undefined ? { optionId: assignment.optionId } : {}),
      }));
      const snapshotAssignments =
        submissionPattern.kind === "time"
          ? canonicalizeConfirmationSnapshotAssignments(rawSnapshotAssignments)
          : normalizeConfirmationSnapshotAssignments(rawSnapshotAssignments);

      return {
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        lineUserId: lineRecipient?.lineUserId,
        lineFollowing: lineRecipient?.following,
        lineRecipient,
        shifts,
        snapshotAssignments,
        snapshotSignature: buildConfirmationSnapshotSignature(snapshotAssignments),
      };
    }),
  );
}

async function getOpenRecruitmentNotificationDataForStaffInternal(ctx: QueryCtx, staffId: Id<"staffs">) {
  const staff = await ctx.db.get(staffId);
  if (!staff || !isShiftTargetStaff(staff)) return null;

  const shop = await ctx.db.get(staff.shopId);
  if (!shop || shop.isDeleted) return null;

  const now = Date.now();
  const today = todayJST();
  const recruitments = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_and_isDeleted_and_status_and_periodStart", (q) =>
      q.eq("shopId", staff.shopId).eq("isDeleted", false).eq("status", "open").gt("periodStart", today),
    )
    .take(OPEN_RECRUITMENT_NOTIFICATION_LIMIT);

  const openRecruitments = recruitments
    .filter((r) => now < getSubmitLinkCutoff(r.periodStart) && now < getDeadlineCutoff(r.deadline))
    .map((r) => ({
      recruitmentId: r._id,
      periodLabel: formatPeriodLabel(r.periodStart, r.periodEnd),
      periodStart: r.periodStart,
      deadline: r.deadline,
    }));

  const lineRecipient = await resolveLineRecipientSnapshot(ctx, staff);

  return {
    shopId: staff.shopId,
    shopName: shop.name,
    staff: {
      staffId: staff._id,
      name: staff.name,
      email: staff.email,
      emailNormalized: staff.emailNormalized,
      lineUserId: lineRecipient?.lineUserId,
      lineFollowing: lineRecipient?.following,
      lineRecipient,
    },
    recruitments: openRecruitments,
  };
}

/**
 * シフト確定メール送信に必要なデータを一括取得
 */
export const getConfirmationEmailData = internalQuery({
  args: {
    recruitmentId: v.id("recruitments"),
    targetStaffIds: v.optional(v.array(v.id("staffs"))),
  },
  handler: async (ctx, { recruitmentId, targetStaffIds }) => {
    if (targetStaffIds && targetStaffIds.length > NOTIFICATION_FANOUT_SCOPE_LIMIT) {
      throw new Error("Notification fanout scope exceeds the supported limit");
    }
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;
    if (recruitment.status !== "confirmed") return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const [allStaffs, assignments] = await Promise.all([
      targetStaffIds
        ? Promise.all(targetStaffIds.map((staffId) => ctx.db.get(staffId)))
        : ctx.db
            .query("staffs")
            .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
            .take(NOTIFICATION_FANOUT_SCOPE_LIMIT + 1),
      getConfirmationAssignments(ctx, recruitmentId, targetStaffIds),
    ]);
    if (allStaffs.length > NOTIFICATION_FANOUT_SCOPE_LIMIT) {
      throw new Error("Notification fanout scope exceeds the supported limit");
    }
    const staffs = allStaffs.flatMap((staff) =>
      staff && !staff.isDeleted && staff.shopId === recruitment.shopId ? [staff] : [],
    );

    const targetStaffIdSet = targetStaffIds ? new Set(targetStaffIds) : null;
    // シフト対象外スタッフには確定通知を送らない。
    const eligibleStaffs = staffs.filter(isShiftTargetStaff);
    const targetStaffs = targetStaffIdSet
      ? eligibleStaffs.filter((staff) => targetStaffIdSet.has(staff._id))
      : eligibleStaffs;
    const staffEntries = await buildConfirmationStaffEntries(ctx, recruitment, targetStaffs, assignments);

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      staffEntries,
    };
  },
});

/**
 * 募集開始メール送信に必要なデータを取得
 */
export const getRecruitmentEmailData = internalQuery({
  args: {
    recruitmentId: v.id("recruitments"),
    targetStaffIds: v.optional(v.array(v.id("staffs"))),
  },
  handler: async (ctx, { recruitmentId, targetStaffIds }) => {
    if (targetStaffIds && targetStaffIds.length > NOTIFICATION_FANOUT_SCOPE_LIMIT) {
      throw new Error("Notification fanout scope exceeds the supported limit");
    }
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;
    const now = Date.now();
    if (
      recruitment.status !== "open" ||
      now >= getSubmitLinkCutoff(recruitment.periodStart) ||
      now >= getDeadlineCutoff(recruitment.deadline)
    ) {
      return null;
    }

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const staffs = targetStaffIds
      ? (await Promise.all(targetStaffIds.map((staffId) => ctx.db.get(staffId)))).flatMap((staff) =>
          staff && !staff.isDeleted && staff.shopId === recruitment.shopId ? [staff] : [],
        )
      : await ctx.db
          .query("staffs")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
          .take(NOTIFICATION_FANOUT_SCOPE_LIMIT + 1);
    if (staffs.length > NOTIFICATION_FANOUT_SCOPE_LIMIT) {
      throw new Error("Notification fanout scope exceeds the supported limit");
    }

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      periodStart: recruitment.periodStart,
      deadline: recruitment.deadline,
      staffEntries: await Promise.all(
        // シフト対象外スタッフには募集通知を送らない。
        staffs.filter(isShiftTargetStaff).map(async (s) => {
          const lineRecipient = await resolveLineRecipientSnapshot(ctx, s);
          return {
            staffId: s._id,
            name: s.name,
            email: s.email,
            lineUserId: lineRecipient?.lineUserId,
            lineFollowing: lineRecipient?.following,
            lineRecipient,
          };
        }),
      ),
    };
  },
});

/**
 * 不達再通知用に、1スタッフ・1募集のシフト募集通知データを取得する。
 */
export const getRecruitmentNotificationDataForStaff = internalQuery({
  args: {
    recruitmentId: v.id("recruitments"),
    staffId: v.id("staffs"),
  },
  handler: async (ctx, { recruitmentId, staffId }) => {
    const [recruitment, staff] = await Promise.all([ctx.db.get(recruitmentId), ctx.db.get(staffId)]);
    if (!recruitment || recruitment.isDeleted || !staff || !isShiftTargetStaff(staff)) return null;
    if (staff.shopId !== recruitment.shopId) return null;

    const now = Date.now();
    if (
      recruitment.status !== "open" ||
      now >= getSubmitLinkCutoff(recruitment.periodStart) ||
      now >= getDeadlineCutoff(recruitment.deadline)
    ) {
      return null;
    }

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;
    const lineRecipient = await resolveLineRecipientSnapshot(ctx, staff);

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      recruitment: {
        recruitmentId: recruitment._id,
        periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
        periodStart: recruitment.periodStart,
        deadline: recruitment.deadline,
      },
      staff: {
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        lineUserId: lineRecipient?.lineUserId,
        lineFollowing: lineRecipient?.following,
        lineRecipient,
      },
    };
  },
});

/**
 * rolling deploy中にin-progressの旧個別通知actionが読む互換query。
 * 旧return shapeを維持しつつ、40件上限・dirty・tenant状態を現在値でfail closedに再検証する。
 * TODO[narrow]: 全deploymentで旧個別通知actionのschedulerが0件になり、drain期間が終わった後に削除する。
 */
export const getCurrentConfirmationEmailDataForStaff = internalQuery({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const staff = await ctx.db.get(staffId);
    if (!staff || !isShiftTargetStaff(staff)) return null;

    const shop = await ctx.db.get(staff.shopId);
    if (!shop || !(await isShopParentActive(ctx, shop))) return null;

    const recruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_status_and_periodEnd", (q) =>
        q.eq("shopId", staff.shopId).eq("isDeleted", false).eq("status", "confirmed").gte("periodEnd", todayJST()),
      )
      .order("asc")
      .take(CURRENT_SHIFT_NOTIFICATION_LIMIT + 1);
    if (
      recruitments.length > CURRENT_SHIFT_NOTIFICATION_LIMIT ||
      recruitments.some(
        (recruitment) =>
          recruitment.draftSavedAt !== undefined &&
          (recruitment.confirmedAt === undefined || recruitment.draftSavedAt > recruitment.confirmedAt),
      )
    ) {
      return null;
    }

    const lineRecipient = await resolveLineRecipientSnapshot(ctx, staff);
    const assignmentsByRecruitment: Doc<"shiftAssignments">[][] = [];
    let remainingAssignmentCapacity = SHIFT_ASSIGNMENT_LIMIT;
    for (const recruitment of recruitments) {
      const assignments = await ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitment._id).eq("staffId", staff._id))
        .take(remainingAssignmentCapacity + 1);
      if (assignments.length > remainingAssignmentCapacity) return null;
      assignmentsByRecruitment.push(assignments);
      remainingAssignmentCapacity -= assignments.length;
    }

    const recruitmentEntries = await Promise.all(
      recruitments.map(async (recruitment, index) => {
        const assignments = assignmentsByRecruitment[index];
        const staffEntries = await buildConfirmationStaffEntries(ctx, recruitment, [staff], assignments, lineRecipient);
        const staffEntry = staffEntries[0];
        return staffEntry
          ? {
              recruitmentId: recruitment._id,
              periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
              staffEntry,
            }
          : null;
      }),
    );

    return {
      shopId: staff.shopId,
      shopName: shop.name,
      staff: {
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        lineUserId: lineRecipient?.lineUserId,
        lineFollowing: lineRecipient?.following,
        lineRecipient,
      },
      recruitments: recruitmentEntries.filter(
        (entry): entry is NonNullable<(typeof recruitmentEntries)[number]> => entry !== null,
      ),
    };
  },
});

/**
 * 後から追加・LINE連携された1スタッフに、現在募集中の希望提出通知を送るためのデータを取得する。
 */
export const getOpenRecruitmentNotificationDataForStaff = internalQuery({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    return await getOpenRecruitmentNotificationDataForStaffInternal(ctx, staffId);
  },
});

/**
 * メール変更後に現在募集中の希望提出リンクを追送するためのデータを取得する。
 * 連続更新で古い予約が残っても、現在メールと一致しないものは送らない。
 */
export const getOpenRecruitmentEmailChangeNotificationDataForStaff = internalQuery({
  args: {
    staffId: v.id("staffs"),
    expectedEmailNormalized: v.string(),
  },
  handler: async (ctx, { staffId, expectedEmailNormalized }) => {
    const data = await getOpenRecruitmentNotificationDataForStaffInternal(ctx, staffId);
    if (!data) return null;

    // TODO[narrow]: 全deploymentでm032が完走し、verifyStaffsのemail残件が全pageで0になった後にemail fallbackを削除する。
    const currentEmailNormalized = normalizeEmail(data.staff.emailNormalized ?? data.staff.email);
    if (currentEmailNormalized === "" || currentEmailNormalized !== expectedEmailNormalized) return null;

    return data;
  },
});

/**
 * 再発行メール送信に必要なデータを取得
 */
export const getReissueEmailData = internalQuery({
  args: {
    staffId: v.id("staffs"),
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, { staffId, recruitmentId }) => {
    const [staff, recruitment] = await Promise.all([ctx.db.get(staffId), ctx.db.get(recruitmentId)]);
    if (!staff || !isShiftTargetStaff(staff) || !recruitment || recruitment.isDeleted) return null;
    if (staff.shopId !== recruitment.shopId) return null;
    if (recruitment.status !== "confirmed") return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const lineRecipient = await resolveLineRecipientSnapshot(ctx, staff);

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      staffName: staff.name,
      staffEmail: staff.email,
      lineUserId: lineRecipient?.lineUserId,
      lineFollowing: lineRecipient?.following,
      lineRecipient,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
    };
  },
});
