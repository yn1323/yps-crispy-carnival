import { type CreateEmailOptions, Resend } from "resend";
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

export async function sendResendEmail(resend: Resend, payload: CreateEmailOptions, context: string): Promise<string> {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await resend.emails.send(payload);
    if (!result.error) return result.data.id;

    const retryable = result.error.statusCode === 429 || result.error.statusCode === null;
    const isLastAttempt = attempt === maxAttempts;
    console.error("Resend email send failed", {
      context,
      attempt,
      statusCode: result.error.statusCode,
      name: result.error.name,
      message: result.error.message,
      retryAfter: result.headers?.["retry-after"],
      rateLimitReset: result.headers?.["ratelimit-reset"],
    });

    if (!retryable || isLastAttempt) {
      throw new Error(`Resend email send failed: ${result.error.name} ${result.error.message}`);
    }

    await sleep(resolveRetryDelayMs(result.headers, attempt));
  }

  throw new Error("Resend email send failed");
}

function countRecipients(to: unknown): number {
  if (Array.isArray(to)) return to.length;
  return typeof to === "string" && to.length > 0 ? 1 : 0;
}

function resolveRetryDelayMs(headers: Record<string, string> | null, attempt: number) {
  const retryAfter = Number(headers?.["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;

  const rateLimitReset = Number(headers?.["ratelimit-reset"]);
  if (Number.isFinite(rateLimitReset) && rateLimitReset > 0) return rateLimitReset * 1000;

  return attempt * 1000;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
