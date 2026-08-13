import type { Id } from "../_generated/dataModel";
import type { ConfirmationSnapshotAssignment } from "../notification/confirmationSnapshots";
import type { LinePushMessage } from "../notification/templates";

export type NotificationHistoryInput = {
  notificationKind: string;
  displayTitle: string;
};

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
    history?: NotificationHistoryInput;
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
    history?: NotificationHistoryInput;
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

export type CanonicalLineRecipientSnapshot = {
  organizationPersonLineLinkId: Id<"organizationPersonLineLinks">;
  organizationPersonLineGenerationAtEnqueue: number;
};

export type NotificationLineRecipient =
  | ({
      authority: "legacy";
      lineUserId: string;
      following: boolean;
    } & (
      | {
          organizationPersonLineLinkId: Id<"organizationPersonLineLinks">;
          generation: number;
        }
      | {
          organizationPersonLineLinkId?: never;
          generation?: never;
        }
    ))
  | {
      authority: "canonical";
      organizationPersonLineLinkId: Id<"organizationPersonLineLinks">;
      generation: number;
      lineUserId: string;
      following: boolean;
    };

export function toNotificationLineRecipient(
  recipient:
    | null
    | ({
        authority: "legacy";
        organizationPersonLineLinkId?: Id<"organizationPersonLineLinks">;
        generation?: number;
      } & Pick<NotificationLineRecipient, "lineUserId" | "following">)
    | Extract<NotificationLineRecipient, { authority: "canonical" }>,
): NotificationLineRecipient | null {
  if (!recipient) return null;
  if (
    recipient.authority === "legacy" &&
    (recipient.organizationPersonLineLinkId === undefined) !== (recipient.generation === undefined)
  ) {
    return null;
  }
  return recipient.authority === "canonical"
    ? {
        authority: "canonical",
        organizationPersonLineLinkId: recipient.organizationPersonLineLinkId,
        generation: recipient.generation,
        lineUserId: recipient.lineUserId,
        following: recipient.following,
      }
    : recipient.organizationPersonLineLinkId !== undefined && recipient.generation !== undefined
      ? {
          authority: "legacy",
          organizationPersonLineLinkId: recipient.organizationPersonLineLinkId,
          generation: recipient.generation,
          lineUserId: recipient.lineUserId,
          following: recipient.following,
        }
      : {
          authority: "legacy",
          lineUserId: recipient.lineUserId,
          following: recipient.following,
        };
}

export function lineRecipientOutboxSnapshot(
  recipient: NotificationLineRecipient,
): CanonicalLineRecipientSnapshot | Record<string, never> {
  return recipient.organizationPersonLineLinkId !== undefined
    ? {
        organizationPersonLineLinkId: recipient.organizationPersonLineLinkId,
        organizationPersonLineGenerationAtEnqueue: recipient.generation,
      }
    : {};
}

export type NotificationCancelReason =
  | "organization_billing_changed"
  | "organization_restricted"
  | "organization_inactive"
  | "shop_inactive"
  | "recruitment_inactive"
  | "notification_superseded"
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

type NotificationHistoryTarget =
  | {
      staffId: Id<"staffs">;
      history: NotificationHistoryInput;
      historyMode?: never;
    }
  | {
      staffId: Id<"staffs">;
      history?: never;
      historyMode: "legacy_no_history";
    }
  | {
      staffId?: never;
      history?: never;
      historyMode?: never;
    };

type EnqueueNotificationCommon<TPayload extends NotificationPayload> = {
  organizationPersonLineLinkId?: Id<"organizationPersonLineLinks">;
  organizationPersonLineGenerationAtEnqueue?: number;
  organizationBillingVersionAtOrigin?: number;
  purpose: NotificationPurpose;
  organizationInvitationId?: Id<"organizationInvitations">;
  organizationInvitationVersion?: number;
  recruitmentId?: Id<"recruitments">;
  userId?: Id<"users">;
  /** durable fanoutの同一semantic targetではterminal rowも再利用し、provider再送を防ぐ。 */
  dedupeAcrossTerminal?: boolean;
  /** channel選択が変わっても同じoperation×staffを一つのoutboxへ収束させる。 */
  fanoutTargetKey?: string;
  fanoutOperationId?: Id<"notificationFanoutOperations">;
  fanoutLeaseToken?: string;
  /** confirmation fanoutのOutbox作成と同じtransactionで保存する配送内容snapshot。 */
  confirmationSnapshot?: {
    assignments: ConfirmationSnapshotAssignment[];
    signature: string;
  };
  /** Widen前のfanout rowをemail/LINEどちらのdedupeKeyでもlazy照合する。 */
  legacyFanoutDedupeKeys?: readonly string[];
  dedupeKey: string;
  payload: TPayload;
};

export type EnqueueNotificationInput<TPayload extends NotificationPayload = NotificationPayload> = NotificationScope &
  NotificationHistoryTarget &
  EnqueueNotificationCommon<TPayload>;
