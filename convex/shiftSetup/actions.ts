import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import { observedAction as action } from "../_lib/errorObservability";
import { shiftDayTemplateSlotValidator, shiftDayTemplateWeekdayValidator } from "../_lib/shiftSetupValidators";
import { buildRandomShiftSetupDraft } from "./assistDraft";
import type { PreparedAssistRequest } from "./mutations";
import { assistSituationSchema } from "./schemas";

const assistResultValidator = v.union(
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("rateLimited") }),
  v.object({
    status: v.literal("ok"),
    templates: v.array(
      v.object({
        name: v.string(),
        weekdays: v.array(shiftDayTemplateWeekdayValidator),
        slots: v.array(shiftDayTemplateSlotValidator),
      }),
    ),
  }),
);
type AssistResult = Infer<typeof assistResultValidator>;

/**
 * 店の状況から、日の型の下書きを返す。設定は保存しない。
 * いまは実際のAIにつながず、入力された文章を読まずに必要人数をランダムな値で埋める。
 * 文章は保存もログ出力もしない。
 */
export const suggestShiftSetup = action({
  args: {
    shopId: v.id("shops"),
    expectedOrganizationId: v.id("organizations"),
    situation: v.string(),
  },
  returns: assistResultValidator,
  handler: async (ctx, args): Promise<AssistResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");

    const situation = assistSituationSchema.safeParse(args.situation);
    if (!situation.success) {
      throw new ConvexError(situation.error.issues[0]?.message ?? "入力内容を確認してください。");
    }

    const prepared: PreparedAssistRequest = await ctx.runMutation(internal.shiftSetup.mutations.prepareAssistRequest, {
      tokenIdentifier: identity.tokenIdentifier,
      shopId: args.shopId,
      expectedOrganizationId: args.expectedOrganizationId,
    });
    if (prepared.status === "notFound") throw new ConvexError("Not found");
    if (prepared.status !== "ready") return { status: prepared.status };

    return {
      status: "ok" as const,
      templates: buildRandomShiftSetupDraft({
        pattern: prepared.submissionPattern,
        positionIds: prepared.positionIds,
        regularClosedDays: prepared.regularClosedDays,
        random: Math.random,
      }),
    };
  },
});
