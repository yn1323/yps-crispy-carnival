import { v } from "convex/values";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { organizationBillingNotificationEventValidator } from "./notification";
import { getEffectiveRestrictedBillingState, getOrganizationBillingStateDeadline } from "./policy";

const historicalRecipientEvents = new Set(["freeApplied"]);

export const getNotificationData = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    event: organizationBillingNotificationEventValidator,
    recipientUserIds: v.optional(v.array(v.id("users"))),
    expectedDeadlineAt: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.id("organizations"),
      organizationName: v.string(),
      trialEnding: v.optional(
        v.object({
          trialEndsAt: v.number(),
          selectedPaidPlan: v.optional(v.union(v.literal("pro"), v.literal("business"))),
        }),
      ),
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
    const [organization, billingState] = await Promise.all([
      ctx.db.get(args.organizationId),
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique(),
    ]);
    if (!organization || organization.isDeleted || !billingState) return null;
    if (billingState.state.kind === "complimentary") return null;
    if (args.event === "trialEnding" && billingState.state.kind !== "trial") return null;
    if (
      args.expectedDeadlineAt !== undefined &&
      getOrganizationBillingStateDeadline(billingState.state) !== args.expectedDeadlineAt
    ) {
      return null;
    }

    const requestedUserIds = args.recipientUserIds ? new Set(args.recipientUserIds) : null;
    if (requestedUserIds && requestedUserIds.size !== args.recipientUserIds?.length) return null;
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const recipients = [];
    const restrictedState = getEffectiveRestrictedBillingState(billingState.state);
    for (const member of members) {
      const isRecoveryRecipient = Boolean(restrictedState?.recoveryManagerPersonIds.includes(member.personId));
      if (
        requestedUserIds ? !requestedUserIds.has(member.userId) : member.status !== "active" && !isRecoveryRecipient
      ) {
        continue;
      }
      const isHistoricalRecipient =
        requestedUserIds !== null && historicalRecipientEvents.has(args.event) && member.status === "readOnly";
      if (member.status !== "active" && !isRecoveryRecipient && !isHistoricalRecipient) continue;
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
      ...(args.event === "trialEnding" && billingState.state.kind === "trial"
        ? {
            trialEnding: {
              trialEndsAt: billingState.state.trialEndsAt,
              ...(billingState.state.selectedPaidPlan ? { selectedPaidPlan: billingState.state.selectedPaidPlan } : {}),
            },
          }
        : {}),
      recipients,
    };
  },
});
