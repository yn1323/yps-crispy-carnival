import { type CreateEmailOptions, type CreateEmailRequestOptions, Resend } from "resend";
import {
  RESEND_EMAIL_SEND_INTERVAL_MS,
  RESEND_EMAIL_SEND_TIMEOUT_MS,
  RESEND_RETRY_DELAY_PADDING_MS,
} from "../constants";
import { getNotificationDeliveryBehavior, logSuppressedNotification } from "./notificationDelivery";

type ResendClientOptions = {
  suppressDelivery?: boolean;
};

type SendEmailResponse = Awaited<ReturnType<Resend["emails"]["send"]>>;
type SendEmailError = NonNullable<SendEmailResponse["error"]>;
type SendEmailRequestOptions = CreateEmailRequestOptions & { signal?: AbortSignal };
type SendResendEmailOptions = {
  idempotencyKey?: string;
};
const DEBUG_NOTIFICATION_FORCE_FAILURE_EMAIL_ERROR =
  "DEBUG_NOTIFICATION_DELIVERY_MODE=force-failure; email notification intentionally failed";

export class ResendEmailError extends Error {
  constructor(
    message: string,
    readonly errorName: string,
    readonly statusCode: number | null,
    readonly retryable: boolean,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = "ResendEmailError";
  }
}

let resendEmailSendQueue: Promise<void> = Promise.resolve();
let nextResendEmailSendAt = 0;

export function getResendClient(options: ResendClientOptions = {}): Resend {
  const deliveryBehavior = getNotificationDeliveryBehavior(options);
  if (deliveryBehavior === "force-failure") {
    return {
      emails: {
        send: async () => ({
          data: null,
          error: {
            name: "debug_notification_force_failure",
            statusCode: 400,
            message: DEBUG_NOTIFICATION_FORCE_FAILURE_EMAIL_ERROR,
          },
          headers: null,
        }),
      },
    } as unknown as Resend;
  }

  if (deliveryBehavior === "dry-run") {
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

export async function sendResendEmail(
  resend: Resend,
  payload: CreateEmailOptions,
  context: string,
  options: SendResendEmailOptions = {},
): Promise<string> {
  const maxAttempts = 4;
  const idempotencyKey = options.idempotencyKey ?? createIdempotencyKey(context);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await waitForResendEmailSendSlot();
    const result = await sendResendEmailAttempt(resend, payload, idempotencyKey);
    if (!result.error) return result.data.id;

    const retryable = isRetryableResendEmailError(result.error);
    const isLastAttempt = attempt === maxAttempts;
    logResendEmailFailure({
      context,
      attempt,
      maxAttempts,
      retryable,
      error: result.error,
      headers: result.headers,
    });

    if (!retryable || isLastAttempt) {
      const errorCode = safeResendErrorCode(result.error, retryable);
      throw new ResendEmailError(
        errorCode,
        errorCode,
        result.error.statusCode,
        retryable,
        retryable ? resolveRetryDelayMs(result.headers, attempt) : null,
      );
    }

    await sleep(resolveRetryDelayMs(result.headers, attempt));
  }

  throw new Error("Resend email send failed");
}

export function resetResendEmailQueueForTest() {
  resendEmailSendQueue = Promise.resolve();
  nextResendEmailSendAt = 0;
}

function countRecipients(to: unknown): number {
  if (Array.isArray(to)) return to.length;
  return typeof to === "string" && to.length > 0 ? 1 : 0;
}

async function waitForResendEmailSendSlot(): Promise<void> {
  const previous = resendEmailSendQueue;
  let release: () => void = () => {};
  resendEmailSendQueue = new Promise((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    const delayMs = nextResendEmailSendAt - Date.now();
    if (delayMs > 0) await sleep(delayMs);
    nextResendEmailSendAt = Date.now() + RESEND_EMAIL_SEND_INTERVAL_MS;
  } finally {
    release();
  }
}

async function sendResendEmailAttempt(
  resend: Resend,
  payload: CreateEmailOptions,
  idempotencyKey: string,
): Promise<SendEmailResponse> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const requestOptions: SendEmailRequestOptions = {
    idempotencyKey,
    signal: controller.signal,
  };

  try {
    return await Promise.race([
      resend.emails.send(payload, requestOptions).catch(() => createNetworkErrorResponse()),
      new Promise<SendEmailResponse>((resolve) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          resolve(createNetworkErrorResponse());
        }, RESEND_EMAIL_SEND_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function createNetworkErrorResponse(): SendEmailResponse {
  return {
    data: null,
    error: {
      name: "application_error",
      statusCode: null,
      message: "email_provider_unavailable",
    },
    headers: null,
  };
}

function isRetryableResendEmailError(error: SendEmailError): boolean {
  return error.name === "rate_limit_exceeded" || error.statusCode === null;
}

function logResendEmailFailure(opts: {
  context: string;
  attempt: number;
  maxAttempts: number;
  retryable: boolean;
  error: SendEmailError;
  headers: Record<string, string> | null;
}) {
  const { context, attempt, maxAttempts, retryable, error, headers } = opts;
  const willRetry = retryable && attempt < maxAttempts;
  const log = willRetry ? console.warn : console.error;
  log(willRetry ? "Resend email send will retry" : "Resend email send failed", {
    context,
    attempt,
    maxAttempts,
    statusCode: error.statusCode,
    errorCode: safeResendErrorCode(error, retryable),
    retryAfterMs: retryable ? resolveRetryDelayMs(headers, attempt) : null,
  });
}

function safeResendErrorCode(error: SendEmailError, retryable: boolean) {
  if (retryable && error.name === "rate_limit_exceeded") return "email_rate_limited";
  if (retryable) return "email_provider_unavailable";
  return "email_recipient_rejected";
}

function resolveRetryDelayMs(headers: Record<string, string> | null, attempt: number) {
  const retryAfter = Number(headers?.["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000 + RESEND_RETRY_DELAY_PADDING_MS;

  const rateLimitReset = Number(headers?.["ratelimit-reset"]);
  if (Number.isFinite(rateLimitReset) && rateLimitReset > 0) {
    return rateLimitReset * 1000 + RESEND_RETRY_DELAY_PADDING_MS;
  }

  return attempt * 1000 + RESEND_RETRY_DELAY_PADDING_MS;
}

function createIdempotencyKey(context: string): string {
  const normalizedContext = context.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  const random = Math.random().toString(36).slice(2, 10);
  return `${normalizedContext}-${Date.now()}-${random}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
