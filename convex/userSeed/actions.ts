import type { FunctionReturnType } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { observedInternalAction as internalAction } from "../_lib/errorObservability";
import type { UserSeedRecruitmentSummary } from "./builders";
import { assertUserSeedEnabled } from "./guard";
import { USER_SEED_RECRUITMENT_KEYS } from "./maxBuilders";
import { RANDOM_SEED_MAX, recruitmentSummaryValidator } from "./mutations";

type MaxSeedResult = {
  randomSeed: number;
  noteMismatchCount: number;
  organizations: Array<{
    organizationId: Id<"organizations">;
    name: string;
    shops: Array<{ name: string; staffCount: number; recruitments: UserSeedRecruitmentSummary[] }>;
  }>;
};

/**
 * 選んだユーザーに、上限の確認用データを通しで入れる。
 * 件数が1回のmutationの上限を超えるため、組織を作るmutationのあと、募集ごとのmutationを順に呼ぶ。
 * 途中で失敗すると、そこまでの分が残る。やり直すときは、組織を消してから入れ直す。
 */
export const seedMaxUserOrganizations = internalAction({
  args: { userId: v.id("users"), randomSeed: v.optional(v.number()) },
  returns: v.object({
    randomSeed: v.number(),
    noteMismatchCount: v.number(),
    organizations: v.array(
      v.object({
        organizationId: v.id("organizations"),
        name: v.string(),
        shops: v.array(
          v.object({
            name: v.string(),
            staffCount: v.number(),
            recruitments: v.array(recruitmentSummaryValidator),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, { userId, randomSeed }): Promise<MaxSeedResult> => {
    assertUserSeedEnabled();
    // 返り値の型を明示する。省くと、生成されたAPIの型がこのactionの型を通って循環する。
    const setup: FunctionReturnType<typeof internal.userSeed.mutations.seedMaxOrganizations> = await ctx.runMutation(
      internal.userSeed.mutations.seedMaxOrganizations,
      {
        userId,
        ...(randomSeed !== undefined ? { randomSeed } : {}),
      },
    );

    let noteMismatchCount = setup.noteMismatchCount;
    let step = 0;
    const organizations: MaxSeedResult["organizations"] = [];
    for (const organization of setup.organizations) {
      const shops: MaxSeedResult["organizations"][number]["shops"] = [];
      for (const shop of organization.shops) {
        const recruitments = [...shop.recruitments];
        for (const recruitmentKey of organization.isMax ? USER_SEED_RECRUITMENT_KEYS : []) {
          step += 1;
          const result: FunctionReturnType<typeof internal.userSeed.mutations.seedMaxRecruitment> =
            await ctx.runMutation(internal.userSeed.mutations.seedMaxRecruitment, {
              userId,
              shopId: shop.shopId,
              recruitmentKey,
              today: setup.today,
              randomSeed: (setup.randomSeed + step) % RANDOM_SEED_MAX,
            });
          recruitments.push(result.summary);
          noteMismatchCount += result.noteMismatchCount;
        }
        shops.push({ name: shop.name, staffCount: shop.staffCount, recruitments });
      }
      organizations.push({ organizationId: organization.organizationId, name: organization.name, shops });
    }
    return { randomSeed: setup.randomSeed, noteMismatchCount, organizations };
  },
});
