import type { Id } from "../_generated/dataModel";

export type NotificationEmailPayload = {
  kind: "email";
  from: string;
  to: string;
  subject: string;
  html: string;
  context: string;
  suppressDelivery?: boolean;
  // 配送失敗時に notificationFailureInbox へ記録しない（失敗リマインダー等のメタ通知用）
  suppressFailureInbox?: boolean;
};

export type NotificationLinePayload = {
  kind: "line";
  toUserId: string;
  text: string;
  suppressDelivery?: boolean;
  // 配送失敗時に notificationFailureInbox へ記録しない（失敗リマインダー等のメタ通知用）
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
