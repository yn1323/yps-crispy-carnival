import { normalizeEmail } from "@/convex/_lib/validation";

/**
 * 確認コードの入力待ち。メールアプリへ切り替えて戻ったときに登録画面が再読み込みされても、
 * コードの入力から続けられるよう、同じtabの中だけで保持する。
 * 時刻はserverが返した残り時間を、この端末の時計の絶対時刻へ直したもの。
 */
export type PendingStaffRegistrationVerification = {
  name: string;
  email: string;
  verificationToken: string;
  resendAvailableAt: number;
  codeExpiresAt: number;
};

const STORAGE_KEY_PREFIX = "shiftori:staff-registration:pending-verification:v1:";

function storageKey(registrationToken: string): string {
  return `${STORAGE_KEY_PREFIX}${registrationToken}`;
}

export function resolveSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isPendingVerification(value: unknown): value is PendingStaffRegistrationVerification {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.verificationToken === "string" &&
    typeof candidate.resendAvailableAt === "number" &&
    Number.isFinite(candidate.resendAvailableAt) &&
    typeof candidate.codeExpiresAt === "number" &&
    Number.isFinite(candidate.codeExpiresAt)
  );
}

/** 期限が切れた入力待ちと、形の崩れた保存値は復元せずに捨てる。 */
export function readPendingVerification(
  storage: Storage | null,
  registrationToken: string,
  now: number,
): PendingStaffRegistrationVerification | null {
  try {
    const raw = storage?.getItem(storageKey(registrationToken));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (isPendingVerification(value) && value.codeExpiresAt > now) {
      return {
        name: value.name,
        email: value.email,
        verificationToken: value.verificationToken,
        resendAvailableAt: value.resendAvailableAt,
        codeExpiresAt: value.codeExpiresAt,
      };
    }
    storage?.removeItem(storageKey(registrationToken));
    return null;
  } catch {
    return null;
  }
}

export function writePendingVerification(
  storage: Storage | null,
  registrationToken: string,
  pending: PendingStaffRegistrationVerification | null,
): void {
  try {
    if (pending) storage?.setItem(storageKey(registrationToken), JSON.stringify(pending));
    else storage?.removeItem(storageKey(registrationToken));
  } catch {
    // 保存領域を使えない場合も、開いている画面の中では入力待ちを続けられる。
  }
}

/**
 * 入力画面へ戻って同じ内容のまま進んだ場合は、届いている確認コードをそのまま使える。
 * 送り直すと送信間隔の制限に当たり、手元のコードを入力できる画面も失うため。
 */
export function canReusePendingVerification(
  pending: PendingStaffRegistrationVerification | null,
  input: { name: string; email: string },
  now: number,
): pending is PendingStaffRegistrationVerification {
  return (
    pending !== null &&
    pending.codeExpiresAt > now &&
    pending.name === input.name &&
    normalizeEmail(pending.email) === normalizeEmail(input.email)
  );
}
