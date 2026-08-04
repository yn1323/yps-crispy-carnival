export const LOGIN_METHOD_OPERATION_COOLDOWN_MS = 30_000;

const STORAGE_KEY = "shiftori:login-methods:operation-cooldown:v1";

type StoredCooldowns = {
  version: 1;
  blockedUntilByKey: Record<string, number>;
};

export type LoginMethodOperationCooldownClaim =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

export type LoginMethodOperationCooldown = {
  claim: (actorId: string, scope: string, now?: number) => LoginMethodOperationCooldownClaim;
};

/** 同一tabの画面遷移やOAuth往復でも、Clerkへの再送開始を絶対期限で抑止する。 */
export function createLoginMethodOperationCooldown(storage: Storage | null = resolveSessionStorage()) {
  const fallbackBlockedUntilByKey = new Map<string, number>();

  return {
    claim(actorId: string, scope: string, now = Date.now()): LoginMethodOperationCooldownClaim {
      const key = `${actorId}:${scope}`;
      const stored = readStoredCooldowns(storage);
      const blockedUntil = Math.max(stored.blockedUntilByKey[key] ?? 0, fallbackBlockedUntilByKey.get(key) ?? 0);
      if (blockedUntil > now) {
        return { allowed: false, retryAfterSeconds: Math.ceil((blockedUntil - now) / 1_000) };
      }

      const nextBlockedUntil = now + LOGIN_METHOD_OPERATION_COOLDOWN_MS;
      fallbackBlockedUntilByKey.set(key, nextBlockedUntil);
      const nextStored: StoredCooldowns = {
        version: 1,
        blockedUntilByKey: Object.fromEntries(
          Object.entries(stored.blockedUntilByKey).filter(([, candidate]) => candidate > now),
        ),
      };
      nextStored.blockedUntilByKey[key] = nextBlockedUntil;
      writeStoredCooldowns(storage, nextStored);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  } satisfies LoginMethodOperationCooldown;
}

export function emailVerificationCooldownScope(emailAddressId: string) {
  return `email-address-verification:${emailAddressId}`;
}

export const GOOGLE_OAUTH_COOLDOWN_SCOPE = "google-oauth";

function readStoredCooldowns(storage: Storage | null): StoredCooldowns {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return emptyStoredCooldowns();
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("blockedUntilByKey" in value) ||
      !value.blockedUntilByKey ||
      typeof value.blockedUntilByKey !== "object"
    ) {
      return emptyStoredCooldowns();
    }

    const blockedUntilByKey = Object.fromEntries(
      Object.entries(value.blockedUntilByKey).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    );
    return { version: 1, blockedUntilByKey };
  } catch {
    return emptyStoredCooldowns();
  }
}

function writeStoredCooldowns(storage: Storage | null, value: StoredCooldowns) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 保存領域を利用できない場合も、このmanagerのmemory内ではcooldownを維持する。
  }
}

function emptyStoredCooldowns(): StoredCooldowns {
  return { version: 1, blockedUntilByKey: {} };
}

function resolveSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
