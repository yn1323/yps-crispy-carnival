import { type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import { observedAction as action } from "../_lib/errorObservability";

const acceptanceActionResultValidator = v.union(
  v.object({ status: v.literal("linked"), organizationId: v.id("organizations"), shopId: v.optional(v.id("shops")) }),
  v.object({ status: v.literal("invalid") }),
  v.object({ status: v.literal("expired") }),
  v.object({ status: v.literal("revoked") }),
  v.object({ status: v.literal("used") }),
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("conflict"), accountAlreadyRegistered: v.boolean() }),
);

type AcceptanceActionResult = Infer<typeof acceptanceActionResultValidator>;

/**
 * 管理者招待の受諾入口。
 * 開いたままの古い画面からの呼び出しを失敗させないため、公開名と引数を変えずactionのまま残している。
 * 判定と状態変更は一つのmutationで行う。
 */
export const accept = action({
  args: { token: v.string() },
  returns: acceptanceActionResultValidator,
  handler: async (ctx, { token }): Promise<AcceptanceActionResult> =>
    await ctx.runMutation(internal.organizationInvitation.mutations.acceptWithToken, { token }),
});
