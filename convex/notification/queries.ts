import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import {
  formatDateLabel,
  formatPeriodLabel,
  generateDateRange,
  getDeadlineCutoff,
  getSubmitLinkCutoff,
  todayJST,
} from "../_lib/dateFormat";
import { getSubmissionPattern } from "../_lib/submissionPattern";
import { buildShiftTimeLabel } from "../_lib/time";
import { DASHBOARD_CURRENT_RECRUITMENT_SCAN_LIMIT, OPEN_RECRUITMENT_NOTIFICATION_LIMIT } from "../constants";
import { getStaffLineAccount } from "../line/service";
import {
  buildConfirmationSnapshotSignature,
  type ConfirmationSnapshotAssignment,
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
  shifts: { date: string; timeLabel: string | null }[];
  snapshotAssignments: ConfirmationSnapshotAssignment[];
  snapshotSignature: string;
};

async function buildConfirmationStaffEntries(
  ctx: QueryCtx,
  recruitment: Doc<"recruitments">,
  staffs: Doc<"staffs">[],
  assignments: Doc<"shiftAssignments">[],
  knownLineAccount?: Doc<"staffLineAccounts"> | null,
): Promise<ConfirmationStaffEntry[]> {
  const dates = generateDateRange(recruitment.periodStart, recruitment.periodEnd);
  const shopClosedDateSet = new Set(recruitment.shopClosedDates ?? []);
  const submissionPattern = getSubmissionPattern(recruitment.submissionPattern, {
    startTime: recruitment.shiftStartTime,
    endTime: recruitment.shiftEndTime,
  });

  return Promise.all(
    staffs.map(async (staff) => {
      const staffAssignments = assignments.filter((a) => a.staffId === staff._id);
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
      const lineAccount =
        knownLineAccount && staffs.length === 1 ? knownLineAccount : await getStaffLineAccount(ctx, staff._id);

      const shifts = dates.map((date) => {
        const timeLabel = shopClosedDateSet.has(date)
          ? "定休日"
          : buildShiftTimeLabel(assignmentsByDate.get(date) ?? [], submissionPattern);
        return {
          date: formatDateLabel(date),
          timeLabel,
        };
      });
      const snapshotAssignments = normalizeConfirmationSnapshotAssignments(
        staffAssignments.map((assignment) => ({
          date: assignment.date,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          positionId: assignment.positionId,
          ...(assignment.optionId ? { optionId: assignment.optionId } : {}),
        })),
      );

      return {
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        lineUserId: lineAccount?.lineUserId,
        lineFollowing: lineAccount?.following,
        shifts,
        snapshotAssignments,
        snapshotSignature: buildConfirmationSnapshotSignature(snapshotAssignments),
      };
    }),
  );
}

async function getOpenRecruitmentNotificationDataForStaffInternal(ctx: QueryCtx, staffId: Id<"staffs">) {
  const staff = await ctx.db.get(staffId);
  if (!staff || staff.isDeleted) return null;

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

  const lineAccount = await getStaffLineAccount(ctx, staff._id);

  return {
    shopId: staff.shopId,
    shopName: shop.name,
    staff: {
      staffId: staff._id,
      name: staff.name,
      email: staff.email,
      emailNormalized: staff.emailNormalized,
      lineUserId: lineAccount?.lineUserId,
      lineFollowing: lineAccount?.following,
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
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;
    if (recruitment.status !== "confirmed") return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const [staffs, assignments] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
        .collect(),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
        .collect(),
    ]);

    const targetStaffIdSet = targetStaffIds ? new Set(targetStaffIds) : null;
    const targetStaffs = targetStaffIdSet ? staffs.filter((staff) => targetStaffIdSet.has(staff._id)) : staffs;
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
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
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

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", recruitment.shopId).eq("isDeleted", false))
      .collect();

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      periodStart: recruitment.periodStart,
      deadline: recruitment.deadline,
      staffEntries: await Promise.all(
        staffs.map(async (s) => {
          const lineAccount = await getStaffLineAccount(ctx, s._id);
          return {
            staffId: s._id,
            name: s.name,
            email: s.email,
            lineUserId: lineAccount?.lineUserId,
            lineFollowing: lineAccount?.following,
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
    if (!recruitment || recruitment.isDeleted || !staff || staff.isDeleted) return null;
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
    const lineAccount = await getStaffLineAccount(ctx, staff._id);

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
        lineUserId: lineAccount?.lineUserId,
        lineFollowing: lineAccount?.following,
      },
    };
  },
});

/**
 * 現在の確定シフト通知を、指定スタッフ1人へ送るためのデータを取得する。
 */
export const getCurrentConfirmationEmailDataForStaff = internalQuery({
  args: { staffId: v.id("staffs") },
  handler: async (ctx, { staffId }) => {
    const staff = await ctx.db.get(staffId);
    if (!staff || staff.isDeleted) return null;

    const shop = await ctx.db.get(staff.shopId);
    if (!shop || shop.isDeleted) return null;

    const today = todayJST();
    const recruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_and_isDeleted_and_status_and_periodStart", (q) =>
        q.eq("shopId", staff.shopId).eq("isDeleted", false).eq("status", "confirmed").lte("periodStart", today),
      )
      .order("desc")
      .take(DASHBOARD_CURRENT_RECRUITMENT_SCAN_LIMIT);

    const currentRecruitments = recruitments.filter((recruitment) => recruitment.periodEnd >= today);
    const lineAccount = await getStaffLineAccount(ctx, staff._id);

    const recruitmentEntries = await Promise.all(
      currentRecruitments.map(async (recruitment) => {
        const assignments = await ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitment._id).eq("staffId", staff._id))
          .collect();
        const staffEntries = await buildConfirmationStaffEntries(ctx, recruitment, [staff], assignments, lineAccount);
        const staffEntry = staffEntries[0];
        if (!staffEntry) return null;
        return {
          recruitmentId: recruitment._id,
          periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
          staffEntry,
        };
      }),
    );

    return {
      shopId: staff.shopId,
      shopName: shop.name,
      staff: {
        staffId: staff._id,
        name: staff.name,
        email: staff.email,
        lineUserId: lineAccount?.lineUserId,
        lineFollowing: lineAccount?.following,
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

    const currentEmailNormalized = (data.staff.emailNormalized ?? data.staff.email).trim().toLowerCase();
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
    if (!staff || staff.isDeleted || !recruitment || recruitment.isDeleted) return null;
    if (staff.shopId !== recruitment.shopId) return null;
    if (recruitment.status !== "confirmed") return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const lineAccount = await getStaffLineAccount(ctx, staff._id);

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      staffName: staff.name,
      staffEmail: staff.email,
      lineUserId: lineAccount?.lineUserId,
      lineFollowing: lineAccount?.following,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
    };
  },
});
