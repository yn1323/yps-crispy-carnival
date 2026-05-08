import { Resend } from "resend";
import { isNotificationDeliverySuppressed, logSuppressedNotification } from "./notificationDelivery";

type ResendClientOptions = {
  suppressDelivery?: boolean;
};

export function getResendClient(options: ResendClientOptions = {}): Resend {
  if (isNotificationDeliverySuppressed(options)) {
    return {
      emails: {
        send: async (payload: unknown) => {
          const email = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
          logSuppressedNotification("email.send", {
            recipientCount: countRecipients(email.to),
            hasSubject: typeof email.subject === "string" && email.subject.length > 0,
          });
          return { data: { id: "dry-run" }, error: null };
        },
      },
    } as unknown as Resend;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return new Resend(apiKey);
}

function countRecipients(to: unknown): number {
  if (Array.isArray(to)) return to.length;
  return typeof to === "string" && to.length > 0 ? 1 : 0;
}
