import { v } from "convex/values";
import { formatPeriodLabel } from "../_lib/dateFormat";
import { staffSessionQuery } from "../_lib/functions";
import { normalizeExactAdjacentTimeAssignments } from "../_lib/shiftAssignmentNormalization";
import { shiftAssignmentReadValidator } from "../_lib/shiftAssignmentValidators";
import { DEFAULT_SHIFT_STAFF_SORT_MODE, shiftStaffSortModeValidator } from "../_lib/shiftStaffSortMode";
import { sessionMatchesAccessKind } from "../_lib/staffAccess";
import { getSubmissionPatternTimeRange, submissionPatternValidator } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
import { SHIFT_ASSIGNMENT_LIMIT, SHIFT_BOARD_STAFF_LIMIT, SHIFT_BOARD_TIME_UNIT_MINUTES } from "../constants";
import { listShopStaffIdsInSavedOrder } from "../organization/staffOrder";
import { getActiveRecruitmentInShop } from "../recruitment/service";
import { listRecruitmentPositions } from "../shiftSetup/service";
import { isShiftTargetStaff } from "../staff/service";

const shiftViewDataValidator = v.object({
  shopName: v.string(),
  periodLabel: v.string(),
  periodStart: v.string(),
  periodEnd: v.string(),
  // スタッフのページで決めた並び順で返す。並び順が有効でない組織は登録順で返す。
  staffs: v.array(v.object({ _id: v.id("staffs"), name: v.string() })),
  // 店舗が選んだスタッフの並び替え。管理者の画面と同じ並びで出すために返す。
  shiftStaffSortMode: shiftStaffSortModeValidator,
  positions: v.array(
    v.object({
      _id: v.id("positions"),
      name: v.string(),
      color: v.string(),
      isDefault: v.boolean(),
    }),
  ),
  assignments: v.array(shiftAssignmentReadValidator),
  shopClosedDates: v.array(v.string()),
  submissionPattern: submissionPatternValidator,
  timeRange: v.object({
    start: v.number(),
    end: v.number(),
    unit: v.number(),
    editableStartMinutes: v.number(),
    editableEndMinutes: v.number(),
  }),
});

export const getShiftViewData = staffSessionQuery({
  args: { recruitmentId: v.id("recruitments") },
  returns: v.union(shiftViewDataValidator, v.null()),
  handler: async (ctx, { recruitmentId }) => {
    if (!ctx.staff || !ctx.shop || !ctx.session) return null;
    const shop = ctx.shop;
    const session = ctx.session;
    if (!sessionMatchesAccessKind(session, "view")) return null;
    if (session.recruitmentId !== recruitmentId) return null;

    const recruitment = await getActiveRecruitmentInShop(ctx, shop._id, recruitmentId);
    if (recruitment?.status !== "confirmed") {
      return null;
    }

    const [staffs, assignments, positions, savedOrder] = await Promise.all([
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT),
      ctx.db
        .query("shiftAssignments")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
        .take(SHIFT_ASSIGNMENT_LIMIT + 1),
      listRecruitmentPositions(ctx, recruitment),
      // 管理者かどうかをスタッフへ示さないよう、並び順が有効でない組織では登録順のままにする。
      listShopStaffIdsInSavedOrder(ctx, { organizationId: shop.organizationId, shopId: shop._id }),
    ]);
    if (assignments.length > SHIFT_ASSIGNMENT_LIMIT) {
      throw new Error("Shift assignment scope exceeds the supported limit");
    }

    const targetStaffs = staffs.filter(isShiftTargetStaff);
    const rankByStaffId = new Map((savedOrder ?? []).map((staffId, index) => [staffId, index] as const));
    // 並び順に載っていない人は、登録順のまま末尾に置く。並べ替えは安定なので、同じ順位どうしは元の順を保つ。
    const orderedStaffs = [...targetStaffs].sort(
      (a, b) =>
        (rankByStaffId.get(a._id) ?? Number.POSITIVE_INFINITY) - (rankByStaffId.get(b._id) ?? Number.POSITIVE_INFINITY),
    );

    const submissionPattern = recruitment.submissionPattern;
    const projectedAssignments =
      submissionPattern.kind === "time" ? normalizeExactAdjacentTimeAssignments(assignments) : assignments;
    const { startTime: startTimeStr, endTime: endTimeStr } = getSubmissionPatternTimeRange(submissionPattern);
    const editableStartMinutes = timeToMinutes(startTimeStr);
    const editableEndMinutes = timeToMinutes(endTimeStr);

    return {
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      staffs: orderedStaffs.map((s) => ({ _id: s._id, name: s.name })),
      shiftStaffSortMode: shop.shiftStaffSortMode ?? DEFAULT_SHIFT_STAFF_SORT_MODE,
      positions: positions.map((p) => ({ _id: p._id, name: p.name, color: p.color, isDefault: p.isDefault })),
      assignments: projectedAssignments.map((a) => ({
        staffId: a.staffId,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        positionId: a.positionId,
        ...(a.optionId !== undefined ? { optionId: a.optionId } : {}),
        ...(a.breaks ? { breaks: a.breaks } : {}),
      })),
      shopClosedDates: recruitment.shopClosedDates,
      submissionPattern,
      timeRange: {
        start: Math.floor(editableStartMinutes / 60),
        end: Math.ceil(editableEndMinutes / 60),
        unit: SHIFT_BOARD_TIME_UNIT_MINUTES,
        editableStartMinutes,
        editableEndMinutes,
      },
    };
  },
});
