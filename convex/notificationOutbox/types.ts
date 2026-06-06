import type { Id } from "../_generated/dataModel";

export type NotificationEmailPayload = {
  kind: "email";
  from: string;
  to: string;
  subject: string;
  html: string;
  context: string;
  suppressDelivery?: boolean;
};

export type NotificationLinePayload = {
  kind: "line";
  toUserId: string;
  text: string;
  suppressDelivery?: boolean;
  fallbackEmail?: {
    dedupeKey: string;
    payload: NotificationEmailPayload;
  };
};

export type NotificationPayload = NotificationEmailPayload | NotificationLinePayload;

export type EnqueueNotificationInput = {
  shopId: Id<"shops">;
  staffId?: Id<"staffs">;
  dedupeKey: string;
  payload: NotificationPayload;
};
