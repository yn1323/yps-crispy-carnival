import type { Doc, Id } from "../_generated/dataModel";
import { getNotificationFailureLogicalKind, type NotificationFailureLogicalKind } from "./failureResend";

export type NotificationFailureIdentity = {
  failureKey: string;
  logicalKind: NotificationFailureLogicalKind;
};

export type NotificationFailureIdentityInput = {
  shopId: Id<"shops">;
  recruitmentId?: Id<"recruitments">;
  staffId?: Id<"staffs">;
  notificationContext: string;
};

export function getNotificationFailureIdentity(
  input: NotificationFailureIdentityInput,
): NotificationFailureIdentity | null {
  const logicalKind = getNotificationFailureLogicalKind(input.notificationContext);
  if (!logicalKind || !input.recruitmentId || !input.staffId) return null;

  return {
    failureKey: notificationFailureLogicalKey({
      shopId: input.shopId,
      recruitmentId: input.recruitmentId,
      staffId: input.staffId,
      logicalKind,
    }),
    logicalKind,
  };
}

export function getNotificationFailureIdentityForDoc(
  failure: Pick<Doc<"notificationFailureInbox">, "shopId" | "recruitmentId" | "staffId" | "notificationContext">,
) {
  return getNotificationFailureIdentity(failure);
}

export function supersededFailureKey(failure: Pick<Doc<"notificationFailureInbox">, "_id" | "failureKey">) {
  return `superseded:${failure._id}:${failure.failureKey}`;
}

function notificationFailureLogicalKey(input: {
  shopId: Id<"shops">;
  recruitmentId: Id<"recruitments">;
  staffId: Id<"staffs">;
  logicalKind: NotificationFailureLogicalKind;
}) {
  return `logical:${input.shopId}:${input.recruitmentId}:${input.staffId}:${input.logicalKind}`;
}
