import { v } from "convex/values";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { canonicalizeOrganizationBillingState } from "./policy";

export const getBillingEmailChangedNotificationData = internalQuery({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.id("organizations"),
      organizationName: v.string(),
      recipients: v.array(
        v.object({
          userId: v.id("users"),
          name: v.string(),
          email: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const [organization, persistedBillingState] = await Promise.all([
      ctx.db.get(args.organizationId),
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique(),
    ]);
    if (!organization || organization.isDeleted || !persistedBillingState) return null;
    const billingState = {
      ...persistedBillingState,
      state: canonicalizeOrganizationBillingState(persistedBillingState.state),
    };
    if (billingState.state.kind === "complimentary") return null;

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const recipients = [];
    for (const member of members) {
      if (member.status !== "active") continue;
      const [person, user] = await Promise.all([ctx.db.get(member.personId), ctx.db.get(member.userId)]);
      if (
        !person ||
        person.organizationId !== args.organizationId ||
        person.userId !== member.userId ||
        person.status !== "active" ||
        !user ||
        user.isDeleted
      ) {
        continue;
      }
      recipients.push({ userId: user._id, name: person.name, email: person.email });
    }
    return {
      organizationId: organization._id,
      organizationName: organization.name,
      recipients,
    };
  },
});
