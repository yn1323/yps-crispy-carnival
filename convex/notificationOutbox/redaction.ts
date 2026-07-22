import type { NotificationPayload } from "./types";

export function notificationContextForPayload(payload: NotificationPayload, dedupeKey: string): string {
  if (payload.kind !== "line") return payload.context;
  return payload.fallbackEmail?.payload.context ?? dedupeContext(dedupeKey);
}

export function notificationDeliverySuppressedForPayload(payload: NotificationPayload): boolean {
  return payload.suppressDelivery === true;
}

/**
 * terminal jobの識別・集計に不要な宛先、本文、fallback payload、capability URLを除去する。
 * 既存validatorとreaderの互換性を保つためkindごとの同型payloadへ置換する。
 */
export function redactNotificationPayload(
  payload: NotificationPayload,
  notificationContext: string,
): NotificationPayload {
  const safeFlags = {
    ...(payload.suppressDelivery === true ? { suppressDelivery: true } : {}),
    ...(payload.suppressFailureInbox === true ? { suppressFailureInbox: true } : {}),
  };

  if (payload.kind === "email") {
    return {
      kind: "email",
      from: "",
      to: "",
      subject: "",
      html: "",
      context: notificationContext,
      ...safeFlags,
    };
  }

  if (payload.kind === "organizationManagerInvitationEmail") {
    return {
      kind: "organizationManagerInvitationEmail",
      from: "",
      to: "",
      context: notificationContext,
      ...safeFlags,
    };
  }

  if (payload.kind === "organizationManagerInvitationLine") {
    return {
      kind: "organizationManagerInvitationLine",
      toUserId: "",
      context: notificationContext,
      ...safeFlags,
      fallbackEmail: {
        dedupeKey: "",
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "",
          to: "",
          context: notificationContext,
          ...safeFlags,
        },
      },
    };
  }

  return {
    kind: "line",
    toUserId: "",
    text: "",
    ...safeFlags,
  };
}

function dedupeContext(dedupeKey: string) {
  return dedupeKey.split(":").slice(0, 2).join(":");
}
