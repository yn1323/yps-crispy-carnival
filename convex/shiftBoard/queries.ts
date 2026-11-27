import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isAiShiftDraftConfigured } from "../_lib/config";
import { generateDateRange, isPastShiftPeriod } from "../_lib/dateFormat";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { managerQuery, organizationQuery } from "../_lib/functions";
import { getRecruitmentEditVersion, isCurrentSubmission } from "../_lib/recruitmentEditing";
import { normalizeExactAdjacentTimeAssignments } from "../_lib/shiftAssignmentNormalization";
import { shiftAssignmentReadValidator, toShiftAssignmentCore } from "../_lib/shiftAssignmentValidators";
import {
  dayRequirementsValidator,
  shiftBreakRuleValidator,
  staffPositionSkillValidator,
} from "../_lib/shiftSetupValidators";
import { DEFAULT_SHIFT_STAFF_SORT_MODE, shiftStaffSortModeValidator } from "../_lib/shiftStaffSortMode";
import { getSubmissionPatternTimeRange, submissionPatternValidator } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
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
import { isPositionsUnsplit } from "../position/service";
import { getActiveRecruitmentInShop } from "../recruitment/service";
import { filterDayRequirementsByPositions } from "../shiftSetup/dayTemplates";
import {
  listDayTemplates,
  listRecruitmentPositions,
  type RecruitmentStaffingDay,
  resolveRecruitmentStaffingDays,
  toPositionSkillsDto,
} from "../shiftSetup/service";
import { isShiftTargetStaff, listShiftTargetStaffsInShop } from "../staff/service";
import type { AiDraftSource } from "./autoCreate/ai/aiDraftPrompt";
import { countAiDraftRemaining, loadAiDraftSource, loadAutoCreateHistory } from "./autoCreateSource";

const shiftBoardWriteBlockReasonValidator = v.union(
  v.literal("paymentResultPending"),
  v.literal("usageLimitExceeded"),
  v.literal("usageLimitEvaluationUnavailable"),
  v.null(),
);

const shiftBoardDataValidator = v.object({
  shopId: v.id("shops"),
  // 店舗がシフト表で最後に選んだ表示。trueは「くわしく」、falseは「シンプル」、nullはまだ選んでいない。
  shiftDetailMode: v.union(v.boolean(), v.null()),
  // 店舗が選んだスタッフの並び替え。まだ選んでいない店舗は「固定」で返す。
  shiftStaffSortMode: shiftStaffSortModeValidator,
  // スタッフのページで決めた並び順。並び順が有効でない組織は、管理者を先にした登録順。画面の並びと出力の両方に使う。
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
    // 保存した下書きに、自動作成した勤務が含まれるか。確定の計測に使う。
    draftAutoCreated: v.boolean(),
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
  shiftAssignments: v.array(shiftAssignmentReadValidator),
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
      listRecruitmentPositions(ctx, recruitment),
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

    const submissionPattern = recruitment.submissionPattern;
    const projectedAssignments =
      submissionPattern.kind === "time" ? normalizeExactAdjacentTimeAssignments(shiftAssignments) : shiftAssignments;
    const { startTime: startTimeStr, endTime: endTimeStr } = getSubmissionPatternTimeRange(submissionPattern);
    const editableStartMinutes = timeToMinutes(startTimeStr);
    const editableEndMinutes = timeToMinutes(endTimeStr);
    // TimeRange.start/end は「時」の数値を期待（9, 22 等）
    const startHour = Math.floor(editableStartMinutes / 60);
    const endHour = Math.ceil(editableEndMinutes / 60);
    const organizationAccess = ctx.organization ? await getOrganizationAccessPolicy(ctx, ctx.organization._id) : null;
    const businessWriteBlockReason =
      !organizationAccess || organizationAccess.usageLimitStatus?.kind === "unknown"
        ? ("usageLimitEvaluationUnavailable" as const)
        : organizationAccess.businessWriteBlockReason;

    return {
      shopId: shop._id,
      shiftDetailMode: shop.shiftDetailMode ?? null,
      shiftStaffSortMode: shop.shiftStaffSortMode ?? DEFAULT_SHIFT_STAFF_SORT_MODE,
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
        draftAutoCreated: recruitment.draftAutoCreatedAt !== undefined,
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
      positions,
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
        ...toShiftAssignmentCore(a),
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

type ShiftBoardStaffingDay = Omit<RecruitmentStaffingDay, "source"> & {
  source: RecruitmentStaffingDay["source"] | "confirmed";
};

/**
 * 確定済みの募集の必要人数を、確定時に保存した内容だけから返す。
 * 保存のない日（テンプレートが当たらなかった日、この機能より前に確定した募集）は未設定として返す。
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
      // 募集のポジションにないものは画面に出せないため、保存した内容からも除いて返す。
      // 確定した時点のポジションを持つ募集では、あとで削除したポジションの必要人数も残る。
      requirements: snapshot?.requirements
        ? filterDayRequirementsByPositions(snapshot.requirements, activePositionIds)
        : null,
    };
  });
}

/**
 * シフト表の「くわしく」表示に使う、日ごとの必要人数、店舗の設定、スタッフの属性を返す。
 * 割当の下書き保存で再送しないよう、getShiftBoardDataとは別に購読する。
 * 未確定の募集は、いまのテンプレートとその日だけの指定から必要人数を決める。
 * 確定済みの募集は、確定時に保存した必要人数だけを返し、テンプレートを直しても変えない。
 */
export const getShiftBoardStaffing = managerQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(
    v.object({
      breakRule: v.union(shiftBreakRuleValidator, v.null()),
      // 全ポジションが一人前（担当できる・熟練度が一人前）のスタッフは返さない。
      // positionSkillsは一人前以外のポジションだけを、ポジションの並び順で持つ。
      staffProfiles: v.array(
        v.object({ staffId: v.id("staffs"), positionSkills: v.array(staffPositionSkillValidator) }),
      ),
      // シフトのAI作成を使える環境か。使えない環境では、自動作成のダイアログでAIを選べなくする。
      isAiDraftConfigured: v.boolean(),
      // この募集で、AIでの作成をあと何回使えるか。0なら、自動作成のダイアログでAIを選べなくする。
      aiDraftRemainingCount: v.number(),
      // 確定済みで、テンプレートの当て直しと「この日だけ変える」ができない。
      isLocked: v.boolean(),
      // まとめて当てるメニューに出すテンプレート。募集の集め方と種類が合うテンプレートだけを返す。
      templates: v.array(v.object({ _id: v.id("shiftDayTemplates"), name: v.string() })),
      // 募集期間の全日。requirementsがnullの日は未設定として扱う。
      days: v.array(
        v.object({
          date: v.string(),
          source: v.union(
            v.literal("confirmed"),
            v.literal("dateCustom"),
            v.literal("dateTemplate"),
            v.literal("dateNone"),
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

    const [positions, templates, staffs] = await Promise.all([
      // 確定済みの募集は確定した時点のポジションで読み、削除したポジションの必要人数も残す。
      listRecruitmentPositions(ctx, recruitment),
      listDayTemplates(ctx, shop._id),
      listShiftTargetStaffsInShop(ctx, shop),
    ]);
    const activePositionIds = new Set(positions.map((position) => position._id));
    const isLocked = recruitment.status === "confirmed";
    // ポジションを追加していない店舗は、「必要人数設定」で必要人数を扱えず、テンプレートも見えない。
    // 確定していない募集のシフト表でも同じにそろえ、テンプレートを出さず、どの日も未設定として返す。
    const hidesTemplates = !isLocked && isPositionsUnsplit(positions);
    const days: ShiftBoardStaffingDay[] = isLocked
      ? await listConfirmedStaffingDays(ctx, recruitment, activePositionIds)
      : hidesTemplates
        ? generateDateRange(recruitment.periodStart, recruitment.periodEnd).map((date) => ({
            date,
            source: "none" as const,
            templateId: null,
            templateName: null,
            requirements: null,
          }))
        : await resolveRecruitmentStaffingDays(ctx, { shopId: shop._id, recruitment, templates, activePositionIds });

    return {
      breakRule: shop.breakRule ?? null,
      staffProfiles: staffs
        .map((staff) => ({ staffId: staff._id, positionSkills: toPositionSkillsDto(staff, positions) }))
        .filter((profile) => profile.positionSkills.length > 0),
      isAiDraftConfigured: isAiShiftDraftConfigured(),
      aiDraftRemainingCount: await countAiDraftRemaining(ctx, recruitment._id),
      isLocked,
      templates: hidesTemplates
        ? []
        : templates
            .filter((template) => template.requirements.kind === recruitment.submissionPattern.kind)
            .map((template) => ({ _id: template._id, name: template.name })),
      days,
    };
  },
});

/**
 * シフトの自動作成が参考にする、過去の確定シフトの集計を返す。
 * 直近に確定した募集のうち、今回と希望シフトの集め方が同じものを、人ごとの日数に数える。
 * 希望と勤務そのものは返さず、数だけを返す。日付メモは読まない。
 * 保存はしない。画面が「作成する」を押したときに1回だけ読む。
 */
export const getAutoCreateHistory = managerQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(
    v.object({
      // 集計に使った募集の数。
      recruitmentCount: v.number(),
      // 希望を1日以上出したことのある、いまシフト対象のスタッフだけを返す。
      staffs: v.array(
        v.object({
          staffId: v.id("staffs"),
          requestedDays: v.number(),
          assignedDays: v.number(),
          lastRequestedDays: v.number(),
          lastAssignedDays: v.number(),
          positions: v.array(v.object({ positionId: v.id("positions"), days: v.number() })),
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
    if (recruitment.status !== "open") return { recruitmentCount: 0, staffs: [] };

    return await loadAutoCreateHistory(ctx, shop, recruitment);
  },
});

/**
 * シフトのAI作成の試作が、材料を読むために使う。
 * 日付メモは要配慮の情報を含みうるため、内部からだけ呼ぶ。受け付け中でない募集と、削除済みの店舗はnullを返す。
 */
export const readAutoCreateAiInput = internalQuery({
  args: { recruitmentId: v.id("recruitments"), includesBreaks: v.boolean() },
  handler: async (ctx, args): Promise<AiDraftSource | null> => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.status !== "open") return null;
    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;
    return await loadAiDraftSource(ctx, { shop, recruitment, includesBreaks: args.includesBreaks });
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
