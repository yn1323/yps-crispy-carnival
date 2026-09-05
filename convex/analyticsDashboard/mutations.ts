import { v } from "convex/values";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { featureRequestUpdateResponseValidator } from "./validators";

/** 本人用HTTP境界だけから呼ぶ。再送で逆転しないよう希望値を保存する。 */
export const setFeatureRequestDeleted = internalMutation({
  args: { id: v.string(), isDeleted: v.boolean() },
  returns: featureRequestUpdateResponseValidator,
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("featureRequests", args.id);
    const request = id ? await ctx.db.get(id) : null;
    if (!request) return null;
    if ((request.isDeleted ?? false) !== args.isDeleted) await ctx.db.patch(request._id, { isDeleted: args.isDeleted });
    return { kind: "requestUpdated" as const, id: request._id, isDeleted: args.isDeleted };
  },
});
