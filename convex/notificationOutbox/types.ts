import type { Id } from "../_generated/dataModel";
import type { LinePushMessage } from "../notification/templates";

export type NotificationRenderedEmailPayload = {
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

/**
 * 管理者招待は生tokenやtoken入りHTMLを永続化しない。
 * provider呼び出し直前に招待を再確認し、この参照情報から本文を組み立てる。
 */
export type NotificationOrganizationManagerInvitationEmailPayload = {
  kind: "organizationManagerInvitationEmail";
  from: string;
  to: string;
  context: string;
  suppressDelivery?: boolean;
  suppressFailureInbox?: boolean;
};

export type NotificationEmailPayload =
  | NotificationRenderedEmailPayload
  | NotificationOrganizationManagerInvitationEmailPayload;

export type NotificationRenderedLinePayload = {
  kind: "line";
  toUserId: string;
  text: string;
  message?: LinePushMessage;
  suppressDelivery?: boolean;
  // 互換用。新規のInbox抑止は notification context を failureSuppress.ts に追加する。
  suppressFailureInbox?: boolean;
  fallbackEmail?: {
    dedupeKey: string;
    payload: NotificationEmailPayload;
  };
};

/** Reference-only manager invitation. The bearer URL is derived immediately before delivery. */
export type NotificationOrganizationManagerInvitationLinePayload = {
  kind: "organizationManagerInvitationLine";
  toUserId: string;
  context: string;
  suppressDelivery?: boolean;
  suppressFailureInbox?: boolean;
  fallbackEmail: {
    dedupeKey: string;
    payload: NotificationOrganizationManagerInvitationEmailPayload;
  };
};

export type NotificationLinePayload =
  | NotificationRenderedLinePayload
  | NotificationOrganizationManagerInvitationLinePayload;

export type NotificationPayload = NotificationEmailPayload | NotificationLinePayload;

export type NotificationChannel = "email" | "line";

export function notificationChannelForPayload(payload: NotificationPayload): NotificationChannel {
  return payload.kind === "line" || payload.kind === "organizationManagerInvitationLine" ? "line" : "email";
}

export type NotificationPurpose = "business" | "billing";

export type NotificationCancelReason =
  | "organization_billing_changed"
  | "organization_restricted"
  | "organization_inactive"
  | "shop_inactive"
  | "recipient_inactive"
  | "invitation_inactive"
  | "unsupported_channel"
  | "invalid_scope";

type NotificationScope =
  | {
      shopId: Id<"shops">;
      organizationId?: Id<"organizations">;
    }
  | {
      shopId?: Id<"shops">;
      organizationId: Id<"organizations">;
    };

export type EnqueueNotificationInput = NotificationScope & {
  organizationBillingVersionAtOrigin?: number;
  purpose?: NotificationPurpose;
  organizationInvitationId?: Id<"organizationInvitations">;
  organizationInvitationVersion?: number;
  recruitmentId?: Id<"recruitments">;
  staffId?: Id<"staffs">;
  userId?: Id<"users">;
  dedupeKey: string;
  payload: NotificationPayload;
};
