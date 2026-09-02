import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

/** operationと同じprovider世代に、一意な終端Subscription snapshotがあることを確認する。 */
export async function hasUniqueTerminalSubscriptionEvidence(
  ctx: { db: GenericDatabaseReader<DataModel> },
  operation: Doc<"organizationStripeOperations">,
  expectedOrganizationId: Id<"organizations"> = operation.organizationId,
) {
  if (!operation.stripeObjectId || operation.providerGeneration === undefined) return false;
  const stripeSubscriptionId = operation.stripeObjectId;
  const subscriptions = await ctx.db
    .query("organizationStripeSubscriptions")
    .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
      q.eq("livemode", operation.livemode).eq("stripeSubscriptionId", stripeSubscriptionId),
    )
    .take(2);
  if (subscriptions.length !== 1) return false;
  const subscription = subscriptions[0];
  return (
    subscription.organizationId === expectedOrganizationId &&
    subscription.providerGeneration === operation.providerGeneration &&
    (subscription.status === "canceled" || subscription.status === "incomplete_expired") &&
    subscription.terminalAt !== undefined
  );
}
