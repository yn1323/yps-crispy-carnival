const CLIENT_TRUST_STATUSES = new Set(["needs_client_trust", "needs_second_factor"]);

export type EmailCodeFactor = {
  strategy: "email_code";
  emailAddressId: string;
  safeIdentifier?: string;
};

type SignInAttempt = {
  status: string | null;
  supportedSecondFactors?: readonly unknown[] | null;
};

type ClientTrustSignInApi = {
  prepareSecondFactor: (params: { strategy: "email_code"; emailAddressId: string }) => Promise<unknown>;
  attemptSecondFactor: (params: {
    strategy: "email_code";
    code: string;
  }) => Promise<{ status: string | null; createdSessionId: string | null }>;
};

function isEmailCodeFactor(factor: unknown): factor is EmailCodeFactor {
  if (!factor || typeof factor !== "object" || !("strategy" in factor)) return false;

  return (
    factor.strategy === "email_code" &&
    "emailAddressId" in factor &&
    typeof factor.emailAddressId === "string" &&
    factor.emailAddressId.length > 0 &&
    (!("safeIdentifier" in factor) || factor.safeIdentifier === undefined || typeof factor.safeIdentifier === "string")
  );
}

/**
 * Clerkの旧SDKではClient Trustもneeds_second_factorとして返る。
 * email_codeはClient Trust用のfactorなので、通常のMFAと混同せずに選べる。
 */
export function findClientTrustEmailCodeFactor(attempt: SignInAttempt): EmailCodeFactor | undefined {
  if (!attempt.status || !CLIENT_TRUST_STATUSES.has(attempt.status)) return undefined;

  return attempt.supportedSecondFactors?.find(isEmailCodeFactor);
}

export function isCompletedSignIn(attempt: { status: string | null; createdSessionId: string | null }): boolean {
  return attempt.status === "complete" && Boolean(attempt.createdSessionId);
}

export async function prepareClientTrustEmailCode(
  signIn: Pick<ClientTrustSignInApi, "prepareSecondFactor">,
  emailAddressId: string,
): Promise<void> {
  await signIn.prepareSecondFactor({ strategy: "email_code", emailAddressId });
}

export async function verifyClientTrustEmailCode(
  signIn: Pick<ClientTrustSignInApi, "attemptSecondFactor">,
  code: string,
): Promise<{ status: string | null; createdSessionId: string | null }> {
  return await signIn.attemptSecondFactor({ strategy: "email_code", code });
}

export function maskEmailAddress(email: string): string {
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) return "登録メールアドレス";

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));

  return `${visiblePrefix}***@${domain}`;
}
