import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getShiftSetupAssistMode } from "../_lib/config";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { managerMutation, resolveManagerShopAccessByTokenIdentifier } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import {
  dayRequirementsValidator,
  shiftBreakRuleValidator,
  shiftDayTemplateWeekdayValidator,
  staffPositionSkillValidator,
} from "../_lib/shiftSetupValidators";
import { submissionPatternValidator } from "../_lib/submissionPattern";
import { isValidIsoDateString } from "../_lib/validation";
import {
  DEFAULT_POSITION_COLOR,
  POSITION_ACTIVE_LIMIT,
  POSITION_COLOR_PALETTE,
  RECRUITMENT_PERIOD_DAYS_MAX,
  SHIFT_BOARD_STAFF_LIMIT,
} from "../constants";
import { ensureDefaultPosition, getDefaultPosition } from "../position/service";
import { getActiveRecruitmentInShop } from "../recruitment/service";
import { getActiveStaffInShop } from "../staff/service";
import {
  DAY_TEMPLATE_ISSUE_MESSAGES,
  type DayRequirements,
  findDayRequirementsIssue,
  findDayTemplateIssue,
  normalizeDayRequirements,
} from "./dayTemplates";
import { breakRuleSchema, savePositionsSchema } from "./schemas";
import { ACTIVE_POSITION_LIMIT_MESSAGE, listActivePositions, listDayTemplates } from "./service";

/**
 * 店舗のポジションを、渡された一覧で置き換える。
 * 並び順は配列の順。一覧にない既存のポジションは論理削除する。
 * 既定のポジションを一覧から外した場合は、一覧の先頭を新しい既定にする。
 * 既定は、ポジションを持たない勤務と、削除したポジションの勤務の表示先である。
 */
export const savePositions = managerMutation({
  args: {
    positions: v.array(v.object({ id: v.optional(v.id("positions")), name: v.string(), color: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parsed = savePositionsSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    }

    // 既定のポジションをまだ持たない店舗では、ここで作る。画面は作る前の一覧しか知らないため、
    // その場合に限って、入力に既定のポジションがなくても受け付けて一覧の先頭へ残す。
    const hadDefaultPosition = (await getDefaultPosition(ctx, ctx.shop._id)) !== null;
    const defaultPositionId = await ensureDefaultPosition(ctx, ctx.shop._id);
    const existing = await listActivePositions(ctx, ctx.shop._id);
    const existingById = new Map(existing.map((position) => [position._id, position]));

    const inputIds = args.positions.flatMap((position) => (position.id ? [position.id] : []));
    if (new Set(inputIds).size !== inputIds.length) throw new ConvexError("Not found");
    // 別店舗・削除済みのIDは、存在を区別せずに拒否する。
    if (inputIds.some((id) => !existingById.has(id))) throw new ConvexError("Not found");
    const replacesDefault = hadDefaultPosition && !inputIds.includes(defaultPositionId);
    const keepsCreatedDefault = !hadDefaultPosition;
    if (keepsCreatedDefault && args.positions.length >= POSITION_ACTIVE_LIMIT) {
      throw new ConvexError(ACTIVE_POSITION_LIMIT_MESSAGE);
    }

    const keptIds = new Set<Id<"positions">>(replacesDefault ? inputIds : [...inputIds, defaultPositionId]);
    const sortOffset = keepsCreatedDefault ? 1 : 0;
    // ここで作った既定のポジションを画面は知らないため、入力の色が既定と重なることがある。
    // その場合は、まだ使っていない色へ置き換えて見分けられるようにする。
    const usedColors = new Set<string>([DEFAULT_POSITION_COLOR, ...parsed.data.positions.map((item) => item.color)]);
    const resolveColor = (color: string): string => {
      if (!keepsCreatedDefault || color !== DEFAULT_POSITION_COLOR) return color;
      const unused = POSITION_COLOR_PALETTE.find((candidate) => !usedColors.has(candidate));
      if (!unused) return color;
      usedColors.add(unused);
      return unused;
    };
    await Promise.all(
      existing
        .filter((position) => !keptIds.has(position._id))
        .map((position) => ctx.db.patch(position._id, { isDeleted: true, isDefault: false })),
    );
    await Promise.all(
      parsed.data.positions.map(async (position, index) => {
        const id = args.positions[index].id;
        const becomesDefault = replacesDefault && index === 0;
        if (id) {
          await ctx.db.patch(id, {
            name: position.name,
            color: position.color,
            sortOrder: index + sortOffset,
            ...(becomesDefault ? { isDefault: true } : {}),
          });
          return;
        }
        await ctx.db.insert("positions", {
          shopId: ctx.shop._id,
          name: position.name,
          color: resolveColor(position.color),
          sortOrder: index + sortOffset,
          isDefault: becomesDefault,
          isDeleted: false,
        });
      }),
    );
    return null;
  },
});

/** 必要人数が指すポジションを返す。同じポジションが複数回出ることがある。 */
function listRequirementPositionIds(requirements: DayRequirements<Id<"positions">>): Id<"positions">[] {
  if (requirements.kind === "time") return requirements.bars.map((bar) => bar.positionId);
  if (requirements.kind === "dateOnly") return requirements.counts.map((entry) => entry.positionId);
  return requirements.options.flatMap((option) => option.counts.map((entry) => entry.positionId));
}

/**
 * 店舗の日の型を、渡された一覧で置き換える。
 * 既存の型はidで引き継ぎ、その日だけの指定が指す型を保つ。一覧にない型は削除する。
 * 削除した型を指す指定は残し、読み取りで無視して曜日と祝日の型へ戻す。
 */
export const saveDayTemplates = managerMutation({
  args: {
    templates: v.array(
      v.object({
        id: v.optional(v.id("shiftDayTemplates")),
        name: v.string(),
        weekdays: v.array(shiftDayTemplateWeekdayValidator),
        appliesToHolidays: v.boolean(),
        requirements: dayRequirementsValidator,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pattern = ctx.shop.submissionPattern;
    const issue = findDayTemplateIssue({ templates: args.templates, pattern });
    if (issue) throw new ConvexError(DAY_TEMPLATE_ISSUE_MESSAGES[issue]);

    const [existing, positions] = await Promise.all([
      listDayTemplates(ctx, ctx.shop._id),
      listActivePositions(ctx, ctx.shop._id),
    ]);
    const existingById = new Map(existing.map((template) => [template._id, template]));
    const activePositionIds = new Set(positions.map((position) => position._id));

    const inputIds = args.templates.flatMap((template) => (template.id ? [template.id] : []));
    if (new Set(inputIds).size !== inputIds.length) throw new ConvexError("Not found");
    // 別店舗・削除済みのIDは、存在を区別せずに拒否する。
    if (inputIds.some((id) => !existingById.has(id))) throw new ConvexError("Not found");
    const hasForeignPosition = args.templates.some((template) =>
      listRequirementPositionIds(template.requirements).some((positionId) => !activePositionIds.has(positionId)),
    );
    if (hasForeignPosition) throw new ConvexError("Not found");

    const keptIds = new Set<Id<"shiftDayTemplates">>(inputIds);
    await Promise.all(
      existing.filter((template) => !keptIds.has(template._id)).map((template) => ctx.db.delete(template._id)),
    );
    await Promise.all(
      args.templates.map(async (template, index) => {
        const document = {
          name: template.name.trim(),
          sortOrder: index,
          weekdays: template.weekdays,
          appliesToHolidays: template.appliesToHolidays,
          requirements: normalizeDayRequirements(template.requirements, pattern),
        };
        if (template.id) {
          await ctx.db.patch(template.id, document);
          return;
        }
        await ctx.db.insert("shiftDayTemplates", { shopId: ctx.shop._id, ...document });
      }),
    );
    return null;
  },
});

/** 休憩の決まり（何分以上の勤務に何分）を保存する。nullで決まりを消す。 */
export const saveBreakRule = managerMutation({
  args: { breakRule: v.union(shiftBreakRuleValidator, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.breakRule === null) {
      await ctx.db.patch(ctx.shop._id, { breakRule: undefined });
      return null;
    }
    const parsed = breakRuleSchema.safeParse(args.breakRule);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    }
    await ctx.db.patch(ctx.shop._id, { breakRule: parsed.data });
    return null;
  },
});

/**
 * スタッフごとの、ポジションごとの扱い（入れない、新人、責任者）をまとめて保存する。
 * 渡したスタッフは全置換で、項目のないポジションは「入れる・熟練度が標準」に戻る。渡さなかったスタッフは変えない。
 */
export const saveStaffShiftProfiles = managerMutation({
  args: {
    profiles: v.array(v.object({ staffId: v.id("staffs"), positionSkills: v.array(staffPositionSkillValidator) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.profiles.length > SHIFT_BOARD_STAFF_LIMIT) {
      throw new ConvexError("一度に保存できるスタッフ数を超えています");
    }
    const staffIds = args.profiles.map((profile) => profile.staffId);
    if (new Set(staffIds).size !== staffIds.length) throw new ConvexError("Not found");

    const positions = await listActivePositions(ctx, ctx.shop._id);
    const activePositionIds = new Set(positions.map((position) => position._id));
    for (const profile of args.profiles) {
      const positionIds = profile.positionSkills.map((skill) => skill.positionId);
      if (new Set(positionIds).size !== positionIds.length) throw new ConvexError("Not found");
      // 別店舗・削除済みのIDは、存在を区別せずに拒否する。
      if (positionIds.some((positionId) => !activePositionIds.has(positionId))) throw new ConvexError("Not found");
      const unavailableCount = profile.positionSkills.filter((skill) => skill.level === "unavailable").length;
      if (unavailableCount > 0 && unavailableCount >= activePositionIds.size) {
        throw new ConvexError("入れるポジションを1つ以上残してください");
      }
    }
    const staffs = await Promise.all(
      args.profiles.map((profile) => getActiveStaffInShop(ctx, ctx.shop._id, profile.staffId)),
    );
    if (staffs.some((staff) => !staff || staff.organizationId !== ctx.shop.organizationId)) {
      throw new ConvexError("Not found");
    }

    await Promise.all(
      args.profiles.map((profile) =>
        ctx.db.patch(profile.staffId, {
          positionSkills: profile.positionSkills.length > 0 ? profile.positionSkills : undefined,
        }),
      ),
    );
    return null;
  },
});

const CONFIRMED_RECRUITMENT_STAFFING_ERROR = "確定済みのシフトでは、必要人数を変更できません。";

/**
 * その日だけの指定を変えられる募集かを確かめる。
 * 募集はこの店舗の未確定のもの、日付は募集期間の内側で重複なし、件数は募集期間の上限までとする。
 */
async function requireStaffingEditableRecruitment(
  ctx: MutationCtx,
  shopId: Id<"shops">,
  recruitmentId: Id<"recruitments">,
  dates: readonly string[],
): Promise<Doc<"recruitments">> {
  const recruitment = await getActiveRecruitmentInShop(ctx, shopId, recruitmentId);
  if (!recruitment) throw new ConvexError("Not found");
  if (recruitment.status === "confirmed") throw new ConvexError(CONFIRMED_RECRUITMENT_STAFFING_ERROR);

  if (dates.length > RECRUITMENT_PERIOD_DAYS_MAX) {
    throw new ConvexError(`一度に変更できるのは${RECRUITMENT_PERIOD_DAYS_MAX}日までです`);
  }
  if (new Set(dates).size !== dates.length) throw new ConvexError("同じ日付が重複しています");
  for (const date of dates) {
    if (!isValidIsoDateString(date)) throw new ConvexError("日付の形式が正しくありません");
    if (date < recruitment.periodStart || date > recruitment.periodEnd) {
      throw new ConvexError("募集期間内の日付を選んでください");
    }
  }
  return recruitment;
}

/** その日だけの指定を消す。同じ日付の指定は1件だけにするため、残っているものをすべて消す。 */
async function deleteDayOverrides(ctx: MutationCtx, shopId: Id<"shops">, date: string): Promise<void> {
  const existing = await ctx.db
    .query("shiftDayTemplateOverrides")
    .withIndex("by_shopId_and_date", (q) => q.eq("shopId", shopId).eq("date", date))
    .take(10);
  await Promise.all(existing.map((override) => ctx.db.delete(override._id)));
}

/**
 * シフト表で選んだ複数の日へ、型をまとめて当てる。
 * nullはその日だけの指定を消し、曜日と祝日の型へ戻す。確定済みの募集では受け付けない。
 */
export const applyDayTemplateToDates = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    dates: v.array(v.string()),
    templateId: v.union(v.id("shiftDayTemplates"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recruitment = await requireStaffingEditableRecruitment(ctx, ctx.shop._id, args.recruitmentId, args.dates);
    const templateId = args.templateId;
    if (templateId !== null) {
      const template = await ctx.db.get(templateId);
      if (!template || template.shopId !== ctx.shop._id) throw new ConvexError("Not found");
      if (template.requirements.kind !== recruitment.submissionPattern.kind) {
        throw new ConvexError("この募集の集め方に合わない型は当てられません");
      }
    }

    for (const date of args.dates) {
      await deleteDayOverrides(ctx, ctx.shop._id, date);
      if (templateId !== null) {
        await ctx.db.insert("shiftDayTemplateOverrides", {
          shopId: ctx.shop._id,
          date,
          kind: "template",
          templateId,
        });
      }
    }
    return null;
  },
});

/**
 * その日だけの必要人数を保存する。型は変えない。
 * 必要人数は募集の集め方に照らして検証する。確定済みの募集では受け付けない。
 * 型へ戻すときは、applyDayTemplateToDatesへnullを渡す。
 */
export const saveDayCustomRequirements = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
    date: v.string(),
    requirements: dayRequirementsValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recruitment = await requireStaffingEditableRecruitment(ctx, ctx.shop._id, args.recruitmentId, [args.date]);
    const pattern = recruitment.submissionPattern;
    const issue = findDayRequirementsIssue(args.requirements, pattern);
    if (issue) throw new ConvexError(DAY_TEMPLATE_ISSUE_MESSAGES[issue]);

    const positions = await listActivePositions(ctx, ctx.shop._id);
    const activePositionIds = new Set(positions.map((position) => position._id));
    // 別店舗・削除済みのポジションは、存在を区別せずに拒否する。
    if (listRequirementPositionIds(args.requirements).some((positionId) => !activePositionIds.has(positionId))) {
      throw new ConvexError("Not found");
    }

    await deleteDayOverrides(ctx, ctx.shop._id, args.date);
    await ctx.db.insert("shiftDayTemplateOverrides", {
      shopId: ctx.shop._id,
      date: args.date,
      kind: "custom",
      requirements: normalizeDayRequirements(args.requirements, pattern),
    });
    return null;
  },
});

const preparedAssistRequestValidator = v.union(
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("notFound") }),
  v.object({ status: v.literal("rateLimited") }),
  v.object({
    status: v.literal("ready"),
    submissionPattern: submissionPatternValidator,
    regularClosedDays: v.array(shiftDayTemplateWeekdayValidator),
    positionIds: v.array(v.id("positions")),
  }),
);
export type PreparedAssistRequest = Infer<typeof preparedAssistRequestValidator>;

/**
 * AIサポートのactionから呼び、権限の確認、rate limit、下書きに使う店舗の情報の取得を1回で行う。
 * 設定は変えない。書き込むのはrate limitの消費だけである。
 */
export const prepareAssistRequest = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    shopId: v.id("shops"),
    expectedOrganizationId: v.id("organizations"),
  },
  returns: preparedAssistRequestValidator,
  handler: async (ctx, args): Promise<PreparedAssistRequest> => {
    if (getShiftSetupAssistMode() === "off") return { status: "unavailable" as const };

    const access = await resolveManagerShopAccessByTokenIdentifier(ctx, args);
    if (!access) return { status: "notFound" as const };

    const consumed = await rateLimit(ctx, {
      name: "shiftSetupAssistShort",
      key: `${access.user._id}:${access.shop._id}`,
    });
    if (!consumed.ok) return { status: "rateLimited" as const };

    const positions = await listActivePositions(ctx, access.shop._id);
    return {
      status: "ready" as const,
      submissionPattern: access.shop.submissionPattern,
      regularClosedDays: access.shop.regularClosedDays,
      positionIds: positions.map((position) => position._id),
    };
  },
});
