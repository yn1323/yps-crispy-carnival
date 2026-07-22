import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getOrganizationBillingStateDeadline } from "./policy";

type DeadlineSchedulerCtx = Pick<MutationCtx, "scheduler">;
type OrganizationBillingDeadlineState = Pick<Doc<"organizationBillingStates">, "organizationId" | "state" | "version">;

/**
 * 現在の課金stateに期限がある場合、現在versionを条件に期限処理を予約する。
 *
 * 課金state以外の参照更新でもversionを進める場合は、古い予約がstaleになるため、
 * 更新後のstateとversionを渡して必ず再予約する。
 */
export async function scheduleOrganizationBillingStateDeadline(
  ctx: DeadlineSchedulerCtx,
  billingState: OrganizationBillingDeadlineState,
) {
  const deadlineAt = getOrganizationBillingStateDeadline(billingState.state);
  if (deadlineAt === null) return;
  await ctx.scheduler.runAt(deadlineAt, internal.organizationBilling.mutations.processDeadline, {
    organizationId: billingState.organizationId,
    expectedVersion: billingState.version,
    expectedDeadlineAt: deadlineAt,
  });
}
