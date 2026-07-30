import { CONVEX_SITE_URL } from "@/src/configs/publicEnv";

export type AccountDeletionFailureReason =
  | "invalidRequest"
  | "authenticationRequired"
  | "associationChanged"
  | "rateLimited"
  | "unavailable"
  | "networkError"
  | "unexpectedError";

export type AccountDeletionSubmissionResult =
  | { status: "accepted" }
  | { status: "rejected"; reason: AccountDeletionFailureReason };

export type ClerkReverificationHint = {
  clerk_error: {
    type: "forbidden";
    reason: "reverification-error";
    metadata?: unknown;
  };
};

type Input = {
  requestId: string;
  token: string;
};

export async function submitAccountDeletionRequest({
  requestId,
  token,
}: Input): Promise<AccountDeletionSubmissionResult | ClerkReverificationHint> {
  let response: Response;
  try {
    response = await fetch(`${CONVEX_SITE_URL}/account-deletion/request`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ requestId }),
    });
  } catch {
    return { status: "rejected", reason: "networkError" };
  }

  const body = await readJson(response);

  // Clerkはこのhintを直接受け取った場合だけ本人確認後に同じfetcherを再実行する。
  if (response.status === 403 && isClerkReverificationHint(body)) {
    return body;
  }

  if (response.status === 202 && isRecord(body) && body.status === "accepted") {
    return { status: "accepted" };
  }

  return {
    status: "rejected",
    reason: failureReasonForStatus(response.status),
  };
}

function failureReasonForStatus(status: number): AccountDeletionFailureReason {
  switch (status) {
    case 400:
      return "invalidRequest";
    case 401:
      return "authenticationRequired";
    case 409:
      return "associationChanged";
    case 429:
      return "rateLimited";
    case 503:
      return "unavailable";
    default:
      return "unexpectedError";
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isClerkReverificationHint(value: unknown): value is ClerkReverificationHint {
  if (!isRecord(value) || !isRecord(value.clerk_error)) return false;

  return value.clerk_error.type === "forbidden" && value.clerk_error.reason === "reverification-error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
