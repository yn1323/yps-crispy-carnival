import { v } from "convex/values";
import { getShiftSetupAssistMode } from "../_lib/config";
import { managerQuery } from "../_lib/functions";
import {
  dayRequirementsValidator,
  shiftBreakRuleValidator,
  shiftDayTemplateWeekdayValidator,
} from "../_lib/shiftSetupValidators";
import { submissionPatternValidator } from "../_lib/submissionPattern";
import { SHIFT_BOARD_STAFF_LIMIT } from "../constants";
import { getOrganizationAccessPolicy } from "../organizationBilling/service";
import { isShiftTargetStaff } from "../staff/service";
import { listActivePositions, listDayTemplates, toDayTemplateDto, toUnavailablePositionIdsDto } from "./service";

const shiftSetupWriteBlockReasonValidator = v.union(
  v.literal("paymentResultPending"),
  v.literal("usageLimitExceeded"),
  v.literal("usageLimitEvaluationUnavailable"),
  v.null(),
);

const shiftSetupValidator = v.object({
  shopName: v.string(),
  submissionPattern: submissionPatternValidator,
  regularClosedDays: v.array(shiftDayTemplateWeekdayValidator),
  canWriteBusinessData: v.boolean(),
  businessWriteBlockReason: shiftSetupWriteBlockReasonValidator,
  positions: v.array(v.object({ _id: v.id("positions"), name: v.string(), color: v.string(), isDefault: v.boolean() })),
  dayTemplates: v.array(
    v.object({
      _id: v.id("shiftDayTemplates"),
      name: v.string(),
      weekdays: v.array(shiftDayTemplateWeekdayValidator),
      appliesToHolidays: v.boolean(),
      // 時間指定で受付時間の外に出たバーも、消さずに返す。画面が本数を数えて知らせる。
      requirements: dayRequirementsValidator,
      // 保存済みの必要人数の種類が、店舗のいまの集め方と違う。requirementsは空で、入れ直しが要る。
      requiresReentry: v.boolean(),
    }),
  ),
  breakRule: v.union(shiftBreakRuleValidator, v.null()),
  staffs: v.array(
    v.object({
      _id: v.id("staffs"),
      name: v.string(),
      unavailablePositionIds: v.array(v.id("positions")),
      skillLevel: v.union(v.literal("newcomer"), v.literal("standard"), v.literal("lead")),
    }),
  ),
  // AIサポートを出せる環境かどうか。無効な環境では、画面にボタンを出さない。
  assistAvailable: v.boolean(),
});

/** 「シフト作成の設定」ページへ、店舗の設定とシフト対象スタッフの属性を返す。 */
export const getShiftSetup = managerQuery({
  args: {},
  returns: v.union(shiftSetupValidator, v.null()),
  handler: async (ctx) => {
    const { shop, organization } = ctx;
    if (!shop || !organization) return null;

    const [positions, templates, staffs, organizationAccess] = await Promise.all([
      listActivePositions(ctx, shop._id),
      listDayTemplates(ctx, shop._id),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT),
      getOrganizationAccessPolicy(ctx, organization._id),
    ]);
    const activePositionIds = new Set(positions.map((position) => position._id));
    const businessWriteBlockReason =
      !organizationAccess || organizationAccess.usageLimitStatus?.kind === "unknown"
        ? ("usageLimitEvaluationUnavailable" as const)
        : organizationAccess.businessWriteBlockReason;

    return {
      shopName: shop.name,
      submissionPattern: shop.submissionPattern,
      regularClosedDays: shop.regularClosedDays,
      canWriteBusinessData: businessWriteBlockReason === null,
      businessWriteBlockReason,
      positions: positions.map((position) => ({
        _id: position._id,
        name: position.name,
        color: position.color,
        isDefault: position.isDefault,
      })),
      dayTemplates: templates.map((template) => toDayTemplateDto(template, shop.submissionPattern, activePositionIds)),
      breakRule: shop.breakRule ?? null,
      staffs: staffs
        .filter((staff) => staff.organizationId === shop.organizationId && isShiftTargetStaff(staff))
        .sort((left, right) => left._creationTime - right._creationTime)
        .map((staff) => ({
          _id: staff._id,
          name: staff.name,
          unavailablePositionIds: toUnavailablePositionIdsDto(staff, activePositionIds),
          skillLevel: staff.skillLevel ?? ("standard" as const),
        })),
      assistAvailable: getShiftSetupAssistMode() !== "off",
    };
  },
});
