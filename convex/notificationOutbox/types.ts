import type { Id } from "../_generated/dataModel";

export type NotificationEmailPayload = {
  kind: "email";
  from: string;
  to: string;
  subject: string;
  html: string;
  context: string;
  suppressDelivery?: boolean;
  // 互換用。新規のInbox抑止は notification context を failureSuppress.ts に追加する。
  suppressFailureInbox?: boolean;
};

export type NotificationLinePayload = {
  kind: "line";
  toUserId: string;
  text: string;
  suppressDelivery?: boolean;
  // 互換用。新規のInbox抑止は notification context を failureSuppress.ts に追加する。
  suppressFailureInbox?: boolean;
  fallbackEmail?: {
    dedupeKey: string;
    payload: NotificationEmailPayload;
  };
};

export type NotificationPayload = NotificationEmailPayload | NotificationLinePayload;

export type EnqueueNotificationInput = {
  shopId: Id<"shops">;
  recruitmentId?: Id<"recruitments">;
  staffId?: Id<"staffs">;
  userId?: Id<"users">;
  dedupeKey: string;
  payload: NotificationPayload;
};
