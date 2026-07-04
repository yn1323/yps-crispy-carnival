import type { GenericDatabaseReader } from "convex/server";
import type { DataModel, Doc } from "../_generated/dataModel";
import { isManagerActionableNotificationFailure } from "./failureResend";

type NotificationFailureEligibilityCtx = {
  db: GenericDatabaseReader<DataModel>;
};

type NotificationFailureEligibilityInput = Pick<
  Doc<"notificationFailureInbox">,
  "notificationContext" | "recruitmentId" | "shopId"
>;

export async function isManagerVisibleNotificationFailure(
  ctx: NotificationFailureEligibilityCtx,
  failure: NotificationFailureEligibilityInput,
) {
  if (!isManagerActionableNotificationFailure(failure.notificationContext)) return false;
  return await hasOpenRecruitmentScope(ctx, failure);
}

export async function hasOpenRecruitmentScope(
  ctx: NotificationFailureEligibilityCtx,
  failure: Pick<Doc<"notificationFailureInbox">, "recruitmentId" | "shopId">,
) {
  if (!failure.recruitmentId) return true;

  const recruitment = await ctx.db.get(failure.recruitmentId);
  return Boolean(
    recruitment && recruitment.shopId === failure.shopId && !recruitment.isDeleted && recruitment.status === "open",
  );
}
