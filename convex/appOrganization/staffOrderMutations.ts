import { ConvexError, v } from "convex/values";
import { organizationMutation } from "../_lib/functions";
import { ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT, saveOrganizationStaffOrderSnapshot } from "../organization/staffOrder";

const saveOrganizationStaffOrderResultValidator = v.object({
  changed: v.boolean(),
  revision: v.number(),
  orderFingerprint: v.string(),
});

export const saveOrganizationStaffOrder = organizationMutation({
  args: {
    orderedPersonIds: v.array(v.id("organizationPeople")),
    expectedOrderFingerprint: v.string(),
  },
  returns: saveOrganizationStaffOrderResultValidator,
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{64}$/.test(args.expectedOrderFingerprint)) {
      throw new ConvexError("並び順の確認情報が不正です");
    }
    if (args.orderedPersonIds.length > ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT) {
      throw new ConvexError(`並び替えられるスタッフは${ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT}名までです`);
    }
    if (new Set(args.orderedPersonIds).size !== args.orderedPersonIds.length) {
      throw new ConvexError("並び順に同じスタッフが複数含まれています");
    }
    return await saveOrganizationStaffOrderSnapshot(ctx, {
      organizationId: ctx.organization._id,
      orderedPersonIds: args.orderedPersonIds,
      expectedOrderFingerprint: args.expectedOrderFingerprint,
    });
  },
});
