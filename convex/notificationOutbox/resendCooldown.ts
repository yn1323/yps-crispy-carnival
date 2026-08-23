import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { NOTIFICATION_RESEND_COOLDOWN_HISTORY_SCAN_LIMIT, NOTIFICATION_RESEND_COOLDOWN_MS } from "../constants";
import { notificationHistoryDisplayStatus } from "./history";
import {
  LINE_INVITE_NOTIFICATION_KIND,
  type NotificationResendCooldownKind,
  SHIFT_CONFIRMATION_NOTIFICATION_KIND,
  SHIFT_RECRUITMENT_NOTIFICATION_KIND,
} from "./historyKinds";

type ResendCooldownDbCtx = Pick<QueryCtx | MutationCtx, "db">;
type NotificationResendCooldownHistory = Pick<
  Doc<"notificationHistory">,
  "notificationKind" | "requestedAt" | "sendStatus" | "deliveryStatus"
>;

export type NotificationResendCooldownTarget = {
  shopId: Id<"shops">;
  staffId: Id<"staffs">;
};

export type NotificationResendCooldowns = {
  openRecruitmentsUntil: number | null;
  currentShiftUntil: number | null;
  lineInviteUntil: number | null;
};

export function isNotificationResendCooldownActive(cooldownUntil: number | null, now: number) {
  return cooldownUntil !== null && cooldownUntil > now;
}

function cooldownUntilForKind(
  histories: readonly NotificationResendCooldownHistory[],
  notificationKind: NotificationResendCooldownKind,
) {
  let cooldownUntil: number | null = null;
  for (const history of histories) {
    if (history.notificationKind !== notificationKind) continue;
    const displayStatus = notificationHistoryDisplayStatus(history);
    if (displayStatus === "failed" || displayStatus === "cancelled") continue;
    const candidate = history.requestedAt + NOTIFICATION_RESEND_COOLDOWN_MS;
    if (cooldownUntil === null || candidate > cooldownUntil) cooldownUntil = candidate;
  }
  return cooldownUntil;
}

export function deriveNotificationResendCooldowns(
  histories: readonly NotificationResendCooldownHistory[],
  conservativeUntil: number | null = null,
): NotificationResendCooldowns {
  const withConservativeFloor = (cooldownUntil: number | null) => {
    if (conservativeUntil === null) return cooldownUntil;
    return cooldownUntil === null ? conservativeUntil : Math.max(cooldownUntil, conservativeUntil);
  };
  return {
    openRecruitmentsUntil: withConservativeFloor(cooldownUntilForKind(histories, SHIFT_RECRUITMENT_NOTIFICATION_KIND)),
    currentShiftUntil: withConservativeFloor(cooldownUntilForKind(histories, SHIFT_CONFIRMATION_NOTIFICATION_KIND)),
    lineInviteUntil: withConservativeFloor(cooldownUntilForKind(histories, LINE_INVITE_NOTIFICATION_KIND)),
  };
}

export async function collectNotificationResendCooldowns(
  ctx: ResendCooldownDbCtx,
  targets: readonly NotificationResendCooldownTarget[],
): Promise<NotificationResendCooldowns> {
  const historiesByTarget = await Promise.all(
    targets.map(
      async ({ shopId, staffId }) =>
        await ctx.db
          .query("notificationHistory")
          .withIndex("by_shopId_and_staffId_and_requestedAt", (q) => q.eq("shopId", shopId).eq("staffId", staffId))
          .order("desc")
          .take(NOTIFICATION_RESEND_COOLDOWN_HISTORY_SCAN_LIMIT),
    ),
  );
  const histories = historiesByTarget.flat();
  const conservativeUntil = historiesByTarget.reduce<number | null>((latest, targetHistories) => {
    if (targetHistories.length < NOTIFICATION_RESEND_COOLDOWN_HISTORY_SCAN_LIMIT) return latest;
    const oldestReturned = targetHistories.at(-1);
    if (!oldestReturned) return latest;
    const candidate = oldestReturned.requestedAt + NOTIFICATION_RESEND_COOLDOWN_MS;
    return latest === null ? candidate : Math.max(latest, candidate);
  }, null);
  return deriveNotificationResendCooldowns(histories, conservativeUntil);
}
