import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { scheduleOrganizationBillingStateDeadline } from "../organizationBilling/deadline";
import type { OrganizationBillingState } from "../organizationBilling/policy";
import { migrations } from "./index";
import {
  recordOrganizationMigrationConflict,
  resolveOrganizationMigrationConflicts,
} from "./organizationMigrationHelpers";

const DUPLICATE_BILLING_STATES_CONFLICT = "billing_business_to_pro_ambiguous_billing_states";

/** m018の実行当時にだけ存在した保存shape。現行runtimeの型へ混ぜない。 */
export type M018HistoricalOrganizationBillingState =
  | OrganizationBillingState
  | { kind: "trial"; trialEndsAt: number; selectedPaidPlan?: "pro" | "business" }
  | { kind: "initialPaymentPending"; plan: "pro" | "business"; startedAt: number }
  | {
      kind: "pendingActivation";
      plan: "pro" | "business";
      fallback: "free" | "pro";
      startedAt: number;
    }
  | { kind: "active"; plan: "free" | "pro" | "business" }
  | { kind: "complimentary"; plan: "pro" | "business" }
  | {
      kind: "scheduledChange";
      currentPlan: "pro" | "business";
      targetPlan: "free" | "pro";
      effectiveAt: number;
      restrictAtPeriodEnd?: true;
    }
  | {
      kind: "grace";
      plan: "pro" | "business";
      targetPlan?: "pro" | "business";
      startedAt: number;
      endsAt: number;
    };

export type M018HistoricalNormalizedOrganizationBillingState =
  | Exclude<M018HistoricalOrganizationBillingState, { kind: "complimentary" }>
  | { kind: "complimentary"; plan: "pro" };

export function normalizeM018OrganizationBillingState(
  state: M018HistoricalOrganizationBillingState,
): M018HistoricalNormalizedOrganizationBillingState {
  switch (state.kind) {
    case "trial": {
      const { selectedPaidPlan, ...rest } = state;
      return {
        ...rest,
        ...(selectedPaidPlan === undefined ? {} : { selectedPaidPlan: "pro" as const }),
      };
    }
    case "initialPaymentPending":
    case "pendingActivation":
    case "grace":
      return { ...state, plan: "pro" };
    case "active":
      return { ...state, plan: state.plan === "free" ? "free" : "pro" };
    case "complimentary":
      return { kind: "complimentary", plan: "pro" };
    case "scheduledChange":
      return state.targetPlan === "pro"
        ? { kind: "active", plan: "pro" }
        : { ...state, currentPlan: "pro", targetPlan: "free" };
    case "paymentTerminationPending":
      return state;
  }
}

function hasM018LegacyBusinessBillingState(state: M018HistoricalOrganizationBillingState): boolean {
  switch (state.kind) {
    case "trial":
      return state.selectedPaidPlan === "business";
    case "initialPaymentPending":
    case "pendingActivation":
    case "grace":
    case "active":
    case "complimentary":
      return state.plan === "business";
    case "scheduledChange": {
      const currentPlan: string = state.currentPlan;
      const targetPlan: string = state.targetPlan;
      return currentPlan === "business" || targetPlan === "pro";
    }
    case "paymentTerminationPending":
      return false;
  }
}

/**
 * m018実行当時のBusiness variantsをProへ畳む履歴migration。
 * Narrow後のfresh replayでは、m021以降の正規形であるcomplimentary.businessを変更しない。
 */
export const migration = migrations.define({
  table: "organizationBillingStates",
  migrateOne: async (ctx, billingState) => {
    const organizationBillingStates = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", billingState.organizationId))
      .take(2);
    if (organizationBillingStates.length !== 1 || organizationBillingStates[0]._id !== billingState._id) {
      await recordOrganizationMigrationConflict(ctx, {
        organizationId: billingState.organizationId,
        sourceType: "organization",
        sourceId: billingState.organizationId,
        code: DUPLICATE_BILLING_STATES_CONFLICT,
      });
      return;
    }
    await resolveOrganizationMigrationConflicts(ctx, {
      sourceType: "organization",
      sourceId: billingState.organizationId,
      codes: [DUPLICATE_BILLING_STATES_CONFLICT],
    });

    // complimentary.businessはm021以降の正規形。完了済みm018のfresh replayでもProへ戻さない。
    if (billingState.state.kind === "complimentary") return;

    const historicalState = billingState.state as M018HistoricalOrganizationBillingState;
    const normalizedState = normalizeM018OrganizationBillingState(historicalState);
    const shouldNormalize = hasM018LegacyBusinessBillingState(historicalState);
    const nextVersion = shouldNormalize ? billingState.version + 1 : billingState.version;

    if (shouldNormalize) {
      const updatedAt = Date.now();
      await ctx.db.patch(billingState._id, {
        state: normalizedState as OrganizationBillingState,
        version: nextVersion,
        updatedAt,
      });
      await cancelPendingLegacyBusinessBillingNotifications(ctx, billingState.organizationId, updatedAt);
      // m018当時のgraceは現行runtimeから削除済みのため、現在のdeadline処理へ再登録しない。
      if (normalizedState.kind !== "grace") {
        await scheduleOrganizationBillingStateDeadline(ctx, {
          organizationId: billingState.organizationId,
          state: normalizedState as OrganizationBillingState,
          version: nextVersion,
        });
      }
    }
  },
});

async function cancelPendingLegacyBusinessBillingNotifications(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Id<"organizations">,
  updatedAt: number,
) {
  const jobs = await ctx.db
    .query("notificationOutbox")
    .withIndex("by_organizationId_purpose_status", (q) =>
      q.eq("organizationId", organizationId).eq("purpose", "billing").eq("status", "pending"),
    )
    .take(100);
  for (const job of jobs) {
    if (
      job.payload.kind !== "email" ||
      !job.payload.context.startsWith("organizationBilling.") ||
      (!job.payload.subject.includes("Businessプラン") && !job.payload.html.includes("Businessプラン"))
    ) {
      continue;
    }
    await ctx.db.patch(job._id, {
      status: "cancelled",
      cancelledAt: updatedAt,
      terminalAt: updatedAt,
      cancelReason: "organization_billing_changed",
      updatedAt,
    });
    const histories = await ctx.db
      .query("notificationHistory")
      .withIndex("by_outboxId", (q) => q.eq("outboxId", job._id))
      .collect();
    for (const history of histories) {
      if (history.sendStatus === "queued") {
        await ctx.db.patch(history._id, { sendStatus: "cancelled", updatedAt });
      }
    }
  }
}
