import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { generateDateRange, getWeekday, isPastShiftPeriod } from "../_lib/dateFormat";
import { managerQuery, organizationQuery } from "../_lib/functions";
import { getRecruitmentEditVersion, isCurrentSubmission } from "../_lib/recruitmentEditing";
import { normalizeExactAdjacentTimeAssignments } from "../_lib/shiftAssignmentNormalization";
import { shiftAssignmentBreakValidator, shiftBoardAssignmentValidator } from "../_lib/shiftAssignmentValidators";
import { dayRequirementsValidator, shiftBreakRuleValidator } from "../_lib/shiftSetupValidators";
import { getSubmissionPatternTimeRange, submissionPatternValidator } from "../_lib/submissionPattern";
import { isSupportedShiftTime, timeToMinutes } from "../_lib/time";
import {
  RECRUITMENT_PERIOD_DAYS_MAX,
  SHIFT_ASSIGNMENT_LIMIT,
  SHIFT_BOARD_DATE_NOTE_LIMIT,
  SHIFT_BOARD_SHIFT_REQUEST_LIMIT,
  SHIFT_BOARD_STAFF_LIMIT,
  SHIFT_BOARD_TIME_UNIT_MINUTES,
} from "../constants";
import { getOrganizationStaffOrderScope } from "../organization/staffOrder";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";
import { getDefaultPosition } from "../position/service";
import { getActiveRecruitmentInShop } from "../recruitment/service";
import { filterDayRequirementsByPositions } from "../shiftSetup/dayTemplates";
import {
  listActivePositions,
  listDayTemplates,
  type RecruitmentStaffingDay,
  resolveRecruitmentStaffingDays,
  toUnavailablePositionIdsDto,
} from "../shiftSetup/service";
import { isShiftTargetStaff } from "../staff/service";

const shiftBoardWriteBlockReasonValidator = v.union(
  v.literal("paymentResultPending"),
  v.literal("usageLimitExceeded"),
  v.literal("usageLimitEvaluationUnavailable"),
  v.null(),
);

const shiftBoardDataValidator = v.object({
  shopId: v.id("shops"),
  exportStaffOrder: v.array(v.id("staffs")),
  canWriteBusinessData: v.boolean(),
  businessWriteBlockReason: shiftBoardWriteBlockReasonValidator,
  recruitment: v.object({
    _id: v.id("recruitments"),
    editVersion: v.number(),
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
    shopClosedDates: v.array(v.string()),
    status: v.union(v.literal("open"), v.literal("confirmed")),
    confirmedAt: v.union(v.number(), v.null()),
    reminderScheduledAt: v.union(v.number(), v.null()),
    lastReminderSentAt: v.union(v.number(), v.null()),
    draftSavedAt: v.union(v.number(), v.null()),
  }),
  submissionPattern: submissionPatternValidator,
  staffs: v.array(
    v.object({
      _id: v.id("staffs"),
      name: v.string(),
      isRemoved: v.boolean(),
      isSubmitted: v.boolean(),
      createdAt: v.number(),
      wasSubmittedAtDraft: v.boolean(),
      // 有効な管理者かどうか。未提出の管理者へシフト対象外の設定を案内するために使う。
      isManager: v.boolean(),
    }),
  ),
  positions: v.array(v.object({ _id: v.id("positions"), name: v.string(), color: v.string(), isDefault: v.boolean() })),
  requestedSlots: v.array(
    v.object({
      staffId: v.id("staffs"),
      date: v.string(),
      startTime: v.string(),
      endTime: v.string(),
      optionId: v.optional(v.string()),
    }),
  ),
  requestedDates: v.array(v.object({ staffId: v.id("staffs"), date: v.string() })),
  shiftAssignments: v.array(shiftBoardAssignmentValidator),
  timeRange: v.object({
    start: v.number(),
    end: v.number(),
    unit: v.number(),
    editableStartMinutes: v.number(),
    editableEndMinutes: v.number(),
  }),
});

export const getShiftBoardData = managerQuery({
  args: {
    recruitmentId: v.id("recruitments"),
    // 日付変更時にfrontendが再購読するためのkey。表示判定にはserver時刻だけを使う。
    refreshDayKey: v.string(),
  },
  returns: v.union(shiftBoardDataValidator, v.null()),
  handler: async (ctx, args) => {
    const { shop } = ctx;
    if (!shop) return null;

    const recruitment = await getActiveRecruitmentInShop(ctx, shop._id, args.recruitmentId);
    if (!recruitment) {
      return null;
    }

    const [allStaffs, shiftSlots, requestedDates, shiftAssignments, positions] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT + 1),
      ctx.db
        .query("shiftSubmissionSlots")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT),
      ctx.db
        .query("shiftSubmissionDates")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(SHIFT_BOARD_SHIFT_REQUEST_LIMIT),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(SHIFT_ASSIGNMENT_LIMIT + 1),
      listActivePositions(ctx, shop._id),
    ]);
    if (shiftAssignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new Error("Shift assignment scope exceeds the supported limit");
    }

    if (allStaffs.length > SHIFT_BOARD_STAFF_LIMIT) throw new ConvexError("シフト表のスタッフ数が上限を超えています。");
    if (allStaffs.some((staff) => staff.organizationId !== shop.organizationId)) throw new ConvexError("Not found");

    const submissions = await ctx.db
      .query("shiftSubmissions")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
      .take(SHIFT_BOARD_STAFF_LIMIT);
    const activeShiftTargetStaffs = allStaffs.filter(isShiftTargetStaff);
    const historicalRemovedStaffs: Doc<"staffs">[] = [];
    if (isPastShiftPeriod(recruitment.periodEnd)) {
      const activeStaffIds = new Set(activeShiftTargetStaffs.map((staff) => staff._id));
      const removedStaffIds = [...new Set(shiftAssignments.map((assignment) => assignment.staffId))].filter(
        (staffId) => !activeStaffIds.has(staffId),
      );
      if (removedStaffIds.length + activeShiftTargetStaffs.length > SHIFT_BOARD_STAFF_LIMIT) {
        throw new ConvexError("履歴を含むシフト表のスタッフ数が上限を超えています。");
      }
      for (const staffId of removedStaffIds) {
        const removedStaff = await ctx.db.get(staffId);
        if (
          removedStaff?.isDeleted &&
          removedStaff.shopId === shop._id &&
          removedStaff.organizationId === shop.organizationId
        )
          historicalRemovedStaffs.push(removedStaff);
      }
    }
    const orderScope = await getOrganizationStaffOrderScope(ctx, {
      organizationId: shop.organizationId,
      shopId: shop._id,
    });
    const managerStaffIds = new Set(
      (
        await Promise.all(
          activeShiftTargetStaffs.map(async (staff) => {
            const members = await ctx.db
              .query("organizationMembers")
              .withIndex("by_organizationId_and_personId", (q) =>
                q.eq("organizationId", shop.organizationId).eq("personId", staff.organizationPersonId),
              )
              .take(2);
            return members.length === 1 && members[0].status === "active" ? staff._id : null;
          }),
        )
      ).filter((staffId) => staffId !== null),
    );
    let exportStaffOrder = activeShiftTargetStaffs.map((staff) => staff._id);
    if (orderScope.mode === "ordered") {
      const entries = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shop._id))
        .take(SHIFT_BOARD_STAFF_LIMIT + 1);
      const byId = new Map(allStaffs.map((staff) => [staff._id, staff]));
      if (
        entries.length !== allStaffs.length ||
        new Set(entries.map((entry) => entry.staffId)).size !== entries.length
      ) {
        throw new ConvexError("スタッフの並び順を確認できません。");
      }
      for (const entry of entries) {
        const staff = byId.get(entry.staffId);
        if (
          !staff ||
          entry.organizationId !== shop.organizationId ||
          entry.organizationPersonId !== staff.organizationPersonId
        ) {
          throw new ConvexError("Not found");
        }
      }
      const targets = new Set(exportStaffOrder);
      exportStaffOrder = entries.map((entry) => entry.staffId).filter((id) => targets.has(id));
    } else {
      exportStaffOrder = activeShiftTargetStaffs
        .map((staff, index) => ({ id: staff._id, index, isManager: managerStaffIds.has(staff._id) }))
        .sort((a, b) => Number(b.isManager) - Number(a.isManager) || a.index - b.index)
        .map(({ id }) => id);
    }
    historicalRemovedStaffs.sort((a, b) => a._creationTime - b._creationTime || a._id.localeCompare(b._id));
    exportStaffOrder.push(...historicalRemovedStaffs.map((staff) => staff._id));
    const submissionByStaffId = new Map(submissions.map((s) => [s.staffId, s]));
    const submittedStaffIds = new Set(submissions.filter(isCurrentSubmission).map((s) => s.staffId));
    const draftSavedAt = recruitment.draftSavedAt ?? null;

    // TimeRange.start/end は「時」の数値を期待（9, 22 等）
    const submissionPattern = recruitment.submissionPattern;
    // 仮の勤務を入れたあとで提出したスタッフには希望を優先するため、そのスタッフの仮の勤務を返さない。
    const visibleAssignments = shiftAssignments.filter(
      (assignment) => !(assignment.isProvisional && submittedStaffIds.has(assignment.staffId)),
    );
    const projectedAssignments =
      submissionPattern.kind === "time"
        ? normalizeExactAdjacentTimeAssignments(visibleAssignments)
        : visibleAssignments;
    const { startTime: startTimeStr, endTime: endTimeStr } = getSubmissionPatternTimeRange(submissionPattern);
    const editableStartMinutes = timeToMinutes(startTimeStr);
    const editableEndMinutes = timeToMinutes(endTimeStr);
    const startHour = Math.floor(editableStartMinutes / 60);
    const endHour = Math.ceil(editableEndMinutes / 60);
    const organizationAccess = ctx.organization ? await getOrganizationAccessPolicy(ctx, ctx.organization._id) : null;
    const businessWriteBlockReason =
      !organizationAccess || organizationAccess.usageLimitStatus?.kind === "unknown"
        ? ("usageLimitEvaluationUnavailable" as const)
        : organizationAccess.businessWriteBlockReason;

    return {
      shopId: shop._id,
      exportStaffOrder,
      canWriteBusinessData: businessWriteBlockReason === null,
      businessWriteBlockReason,
      recruitment: {
        _id: recruitment._id,
        editVersion: getRecruitmentEditVersion(recruitment),
        periodStart: recruitment.periodStart,
        periodEnd: recruitment.periodEnd,
        deadline: recruitment.deadline,
        shopClosedDates: recruitment.shopClosedDates,
        status: recruitment.status,
        confirmedAt: recruitment.confirmedAt ?? null,
        reminderScheduledAt: recruitment.reminderScheduledAt ?? null,
        lastReminderSentAt: recruitment.lastReminderSentAt ?? null,
        draftSavedAt,
      },
      submissionPattern,
      staffs: [
        ...activeShiftTargetStaffs.map((s) => {
          const submission = submissionByStaffId.get(s._id);
          const firstSubmittedAt = submission?.firstSubmittedAt ?? null;
          return {
            _id: s._id,
            name: s.name,
            isRemoved: false,
            isSubmitted: submittedStaffIds.has(s._id),
            createdAt: s._creationTime,
            wasSubmittedAtDraft:
              draftSavedAt !== null && firstSubmittedAt !== null ? firstSubmittedAt <= draftSavedAt : false,
            isManager: managerStaffIds.has(s._id),
          };
        }),
        ...historicalRemovedStaffs.map((staff) => ({
          _id: staff._id,
          name: staff.name,
          isRemoved: true,
          isSubmitted: true,
          createdAt: staff._creationTime,
          wasSubmittedAtDraft: false,
          isManager: false,
        })),
      ],
      positions: positions.map((p) => ({ _id: p._id, name: p.name, color: p.color, isDefault: p.isDefault })),
      requestedSlots: shiftSlots.map((r) => ({
        staffId: r.staffId,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        ...(r.optionId ? { optionId: r.optionId } : {}),
      })),
      requestedDates: requestedDates.map((r) => ({
        staffId: r.staffId,
        date: r.date,
      })),
      shiftAssignments: projectedAssignments.map((a) => ({
        staffId: a.staffId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        positionId: a.positionId,
        ...(a.optionId !== undefined ? { optionId: a.optionId } : {}),
        ...(a.breaks ? { breaks: a.breaks } : {}),
        ...(a.isProvisional ? { isProvisional: true } : {}),
      })),
      timeRange: {
        start: startHour,
        end: endHour,
        unit: SHIFT_BOARD_TIME_UNIT_MINUTES,
        editableStartMinutes,
        editableEndMinutes,
      },
    };
  },
});

/**
 * シフト表に表示する有効スタッフの日付メモだけを返す。
 * 割当の下書き保存で再送しないよう、getShiftBoardDataとは別に購読する。
 */
export const getShiftBoardDateNotes = managerQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(v.array(v.object({ staffId: v.id("staffs"), date: v.string(), note: v.string() })), v.null()),
  handler: async (ctx, args) => {
    const { shop } = ctx;
    if (!shop) return null;

    const recruitment = await getActiveRecruitmentInShop(ctx, shop._id, args.recruitmentId);
    if (!recruitment) return null;

    const [notes, staffs] = await Promise.all([
      ctx.db
        .query("shiftSubmissionDateNotes")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(SHIFT_BOARD_DATE_NOTE_LIMIT + 1),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT + 1),
    ]);
    // 提出時の検証で超えない件数なので、超えた場合は一部だけを返さず失敗させる。
    if (notes.length > SHIFT_BOARD_DATE_NOTE_LIMIT)
      throw new Error("Shift date note scope exceeds the supported limit");
    if (staffs.length > SHIFT_BOARD_STAFF_LIMIT) throw new ConvexError("シフト表のスタッフ数が上限を超えています。");

    const visibleStaffIds = new Set(
      staffs
        .filter((staff) => staff.organizationId === shop.organizationId && isShiftTargetStaff(staff))
        .map((staff) => staff._id),
    );
    return notes
      .filter(
        (entry) =>
          visibleStaffIds.has(entry.staffId) &&
          entry.date >= recruitment.periodStart &&
          entry.date <= recruitment.periodEnd,
      )
      .map(({ staffId, date, note }) => ({ staffId, date, note }));
  },
});

async function getPreviousConfirmedRecruitment(
  ctx: QueryCtx,
  shopId: Id<"shops">,
  periodStart: string,
): Promise<Doc<"recruitments"> | null> {
  return await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_and_isDeleted_and_status_and_periodStart", (q) =>
      q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "confirmed").lt("periodStart", periodStart),
    )
    .order("desc")
    .first();
}

type ShiftBoardStaffingDay = Omit<RecruitmentStaffingDay, "source"> & {
  source: RecruitmentStaffingDay["source"] | "confirmed";
};

/**
 * 確定済みの募集の必要人数を、確定時に保存した内容だけから返す。
 * 保存のない日（型が当たらなかった日、この機能より前に確定した募集）は未設定として返す。
 */
async function listConfirmedStaffingDays(
  ctx: QueryCtx,
  recruitment: Doc<"recruitments">,
  activePositionIds: ReadonlySet<Id<"positions">>,
): Promise<ShiftBoardStaffingDay[]> {
  const snapshots = await ctx.db
    .query("recruitmentStaffingSnapshots")
    .withIndex("by_recruitmentId_and_date", (q) => q.eq("recruitmentId", recruitment._id))
    .take(RECRUITMENT_PERIOD_DAYS_MAX);
  const snapshotByDate = new Map(snapshots.map((snapshot) => [snapshot.date, snapshot]));

  return generateDateRange(recruitment.periodStart, recruitment.periodEnd).map((date) => {
    const snapshot = snapshotByDate.get(date);
    return {
      date,
      source: "confirmed" as const,
      templateId: null,
      templateName: snapshot?.templateName ?? null,
      // 削除済みのポジションは画面に出せないため、保存した内容からも除いて返す。
      requirements: snapshot?.requirements
        ? filterDayRequirementsByPositions(snapshot.requirements, activePositionIds)
        : null,
    };
  });
}

/**
 * シフト表の「くわしく」表示に使う、日ごとの必要人数、店舗の設定、スタッフの属性を返す。
 * 割当の下書き保存で再送しないよう、getShiftBoardDataとは別に購読する。
 * 未確定の募集は、いまの型とその日だけの指定から必要人数を決める。
 * 確定済みの募集は、確定時に保存した必要人数だけを返し、型を直しても変えない。
 */
export const getShiftBoardStaffing = managerQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(
    v.object({
      breakRule: v.union(shiftBreakRuleValidator, v.null()),
      // 標準（全ポジション可、熟練度が標準）のスタッフは返さない。
      staffProfiles: v.array(
        v.object({
          staffId: v.id("staffs"),
          unavailablePositionIds: v.array(v.id("positions")),
          skillLevel: v.union(v.literal("newcomer"), v.literal("standard"), v.literal("lead")),
        }),
      ),
      hasPreviousConfirmedRecruitment: v.boolean(),
      // 確定済みで、型の当て直しと「この日だけ変える」ができない。
      isLocked: v.boolean(),
      // まとめて当てるメニューに出す型。募集の集め方と種類が合う型だけを返す。
      templates: v.array(v.object({ _id: v.id("shiftDayTemplates"), name: v.string() })),
      // 募集期間の全日。requirementsがnullの日は未設定として扱う。
      days: v.array(
        v.object({
          date: v.string(),
          source: v.union(
            v.literal("confirmed"),
            v.literal("dateCustom"),
            v.literal("dateTemplate"),
            v.literal("holiday"),
            v.literal("weekday"),
            v.literal("none"),
          ),
          templateId: v.union(v.id("shiftDayTemplates"), v.null()),
          templateName: v.union(v.string(), v.null()),
          requirements: v.union(dayRequirementsValidator, v.null()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { shop } = ctx;
    if (!shop) return null;

    const recruitment = await getActiveRecruitmentInShop(ctx, shop._id, args.recruitmentId);
    if (!recruitment) return null;

    const [positions, templates, staffs, previousRecruitment] = await Promise.all([
      listActivePositions(ctx, shop._id),
      listDayTemplates(ctx, shop._id),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT),
      getPreviousConfirmedRecruitment(ctx, shop._id, recruitment.periodStart),
    ]);
    const activePositionIds = new Set(positions.map((position) => position._id));
    const isLocked = recruitment.status === "confirmed";
    const days: ShiftBoardStaffingDay[] = isLocked
      ? await listConfirmedStaffingDays(ctx, recruitment, activePositionIds)
      : await resolveRecruitmentStaffingDays(ctx, { shopId: shop._id, recruitment, templates, activePositionIds });

    return {
      breakRule: shop.breakRule ?? null,
      staffProfiles: staffs
        .filter((staff) => staff.organizationId === shop.organizationId && isShiftTargetStaff(staff))
        .map((staff) => ({
          staffId: staff._id,
          unavailablePositionIds: toUnavailablePositionIdsDto(staff, activePositionIds),
          skillLevel: staff.skillLevel ?? ("standard" as const),
        }))
        .filter((profile) => profile.unavailablePositionIds.length > 0 || profile.skillLevel !== "standard"),
      hasPreviousConfirmedRecruitment: previousRecruitment !== null,
      isLocked,
      templates: templates
        .filter((template) => template.requirements.kind === recruitment.submissionPattern.kind)
        .map((template) => ({ _id: template._id, name: template.name })),
      days,
    };
  },
});

/**
 * 未提出者の「仮の勤務」の候補として、直近に確定した募集の同じ曜日の勤務を返す。
 * 保存はしない。画面が勤務のない日へ差し込み、担当者が保存したときに仮の勤務として残る。
 */
export const getProvisionalAssignments = managerQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(
    v.array(
      v.object({
        staffId: v.id("staffs"),
        date: v.string(),
        startTime: v.string(),
        endTime: v.string(),
        positionId: v.id("positions"),
        optionId: v.optional(v.string()),
        breaks: v.optional(v.array(shiftAssignmentBreakValidator)),
      }),
    ),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { shop } = ctx;
    if (!shop) return null;

    const recruitment = await getActiveRecruitmentInShop(ctx, shop._id, args.recruitmentId);
    if (!recruitment) return null;
    if (recruitment.status !== "open") return [];

    const previousRecruitment = await getPreviousConfirmedRecruitment(ctx, shop._id, recruitment.periodStart);
    const pattern = recruitment.submissionPattern;
    // 募集方式が変わった店舗では、前回の勤務を今回の形へ写せない。
    if (!previousRecruitment || previousRecruitment.submissionPattern.kind !== pattern.kind) return [];

    const [staffs, submissions, previousAssignments, positions, defaultPosition] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT),
      ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", args.recruitmentId))
        .take(SHIFT_BOARD_STAFF_LIMIT),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", previousRecruitment._id))
        .take(SHIFT_ASSIGNMENT_LIMIT + 1),
      listActivePositions(ctx, shop._id),
      getDefaultPosition(ctx, shop._id),
    ]);
    if (previousAssignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new Error("Shift assignment scope exceeds the supported limit");
    }
    if (!defaultPosition) return [];

    const submittedStaffIds = new Set(submissions.filter(isCurrentSubmission).map((s) => s.staffId));
    const unsubmittedStaffIds = new Set(
      staffs
        .filter(
          (staff) =>
            staff.organizationId === shop.organizationId &&
            isShiftTargetStaff(staff) &&
            !submittedStaffIds.has(staff._id),
        )
        .map((staff) => staff._id),
    );
    const activePositionIds = new Set(positions.map((position) => position._id));
    const closedDates = new Set(recruitment.shopClosedDates);
    const { startTime: rangeStart, endTime: rangeEnd } = getSubmissionPatternTimeRange(pattern);
    const optionById =
      pattern.kind === "shiftType" ? new Map(pattern.options.map((option) => [option.id, option])) : null;

    // 前回の期間のうち、曜日ごとに最後の日だけを引き継ぎ元にする。
    const sourceDateByWeekday = new Map<number, string>();
    for (const date of generateDateRange(previousRecruitment.periodStart, previousRecruitment.periodEnd)) {
      sourceDateByWeekday.set(getWeekday(date), date);
    }
    const previousByStaffDate = new Map<string, Doc<"shiftAssignments">[]>();
    const sourceAssignments =
      pattern.kind === "time" ? normalizeExactAdjacentTimeAssignments(previousAssignments) : previousAssignments;
    for (const assignment of sourceAssignments) {
      if (!unsubmittedStaffIds.has(assignment.staffId)) continue;
      const key = `${assignment.staffId}|${assignment.date}`;
      const items = previousByStaffDate.get(key) ?? [];
      items.push(assignment);
      previousByStaffDate.set(key, items);
    }

    const result: Array<{
      staffId: Id<"staffs">;
      date: string;
      startTime: string;
      endTime: string;
      positionId: Id<"positions">;
      optionId?: string;
      breaks?: Array<{ startTime: string; endTime: string }>;
    }> = [];
    for (const date of generateDateRange(recruitment.periodStart, recruitment.periodEnd)) {
      if (closedDates.has(date)) continue;
      const sourceDate = sourceDateByWeekday.get(getWeekday(date));
      if (!sourceDate) continue;
      for (const staffId of unsubmittedStaffIds) {
        for (const source of previousByStaffDate.get(`${staffId}|${sourceDate}`) ?? []) {
          if (!isSupportedShiftTime(source.startTime) || !isSupportedShiftTime(source.endTime)) continue;
          if (pattern.kind === "shiftType") {
            // 今回の募集に同じ勤務パターンが同じ時間で残っている場合だけ引き継ぐ。
            const option = source.optionId ? optionById?.get(source.optionId) : undefined;
            if (!option || option.startTime !== source.startTime || option.endTime !== source.endTime) continue;
          } else if (
            timeToMinutes(source.startTime) < timeToMinutes(rangeStart) ||
            timeToMinutes(source.endTime) > timeToMinutes(rangeEnd)
          ) {
            continue;
          }
          result.push({
            staffId,
            date,
            startTime: source.startTime,
            endTime: source.endTime,
            positionId: activePositionIds.has(source.positionId) ? source.positionId : defaultPosition._id,
            ...(source.optionId !== undefined ? { optionId: source.optionId } : {}),
            ...(source.breaks ? { breaks: source.breaks } : {}),
          });
        }
      }
    }
    return result;
  },
});

/** 認証済みappの必須orgから募集→店舗→組織を再検証し、既存ShiftBoard queryへ渡す明示scopeを返す。 */
export const getShiftBoardShopScopeForOrganization = organizationQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(v.object({ shopId: v.id("shops"), shopName: v.string() }), v.null()),
  handler: async (ctx, { recruitmentId }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted || shop.organizationId !== ctx.organization._id) return null;

    return { shopId: shop._id, shopName: shop.name };
  },
});
