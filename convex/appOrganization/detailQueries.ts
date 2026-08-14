import { v } from "convex/values";
import { organizationQuery } from "../_lib/functions";
import { getOrganizationUserDetail, userDetailValidator } from "../organization/userDetailQueries";

/** 店舗をauthority anchorにせず、URLのcanonical組織からスタッフ詳細を読む。 */
export const getUserDetail = organizationQuery({
  args: {
    personId: v.string(),
    now: v.number(),
  },
  returns: v.union(userDetailValidator, v.null()),
  handler: async (ctx, args) => await getOrganizationUserDetail(ctx, args),
});
