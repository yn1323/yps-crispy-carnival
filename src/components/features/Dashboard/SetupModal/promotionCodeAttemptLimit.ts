export const PROMOTION_CODE_MAX_FAILED_ATTEMPTS = 10;
export const PROMOTION_CODE_LOCKOUT_MS = 10 * 60 * 1_000;

const STORAGE_KEY = "shiftori:setup:promotion-code-attempt-limit:v1";

type StoredAttemptLimit = {
  version: 1;
  failedAttempts: number;
  blockedUntil: number | null;
};

export type PromotionCodeAttemptLimitState = {
  failedAttempts: number;
  remainingAttempts: number;
  blockedUntil: number | null;
  isBlocked: boolean;
};

export type PromotionCodeAttemptLimit = {
  read: (now?: number) => PromotionCodeAttemptLimitState;
  recordFailure: (now?: number) => PromotionCodeAttemptLimitState;
  reset: () => PromotionCodeAttemptLimitState;
};

/**
 * 同一tab内の誤入力を抑止するための暫定的なclient-side制限。
 * raw codeは受け取らず、失敗回数と解除期限だけを保持する。
 */
export function createPromotionCodeAttemptLimit(
  storage: Storage | null = resolveSessionStorage(),
): PromotionCodeAttemptLimit {
  let fallbackState = emptyStoredAttemptLimit();

  const persist = (state: StoredAttemptLimit) => {
    fallbackState = state;
    writeStoredAttemptLimit(storage, state);
  };

  const read = (now = Date.now()) => {
    const storedState = readStoredAttemptLimit(storage);
    const current = moreRestrictiveState(storedState, fallbackState);
    if (current.blockedUntil !== null && current.blockedUntil <= now) {
      const resetState = emptyStoredAttemptLimit();
      persist(resetState);
      return toPublicState(resetState, now);
    }

    fallbackState = current;
    return toPublicState(current, now);
  };

  return {
    read,
    recordFailure(now = Date.now()) {
      const current = read(now);
      if (current.isBlocked) return current;

      const failedAttempts = Math.min(PROMOTION_CODE_MAX_FAILED_ATTEMPTS, current.failedAttempts + 1);
      const next: StoredAttemptLimit = {
        version: 1,
        failedAttempts,
        blockedUntil: failedAttempts >= PROMOTION_CODE_MAX_FAILED_ATTEMPTS ? now + PROMOTION_CODE_LOCKOUT_MS : null,
      };
      persist(next);
      return toPublicState(next, now);
    },
    reset() {
      const next = emptyStoredAttemptLimit();
      persist(next);
      return toPublicState(next, Date.now());
    },
  };
}

function moreRestrictiveState(first: StoredAttemptLimit, second: StoredAttemptLimit): StoredAttemptLimit {
  if ((first.blockedUntil ?? 0) !== (second.blockedUntil ?? 0)) {
    return (first.blockedUntil ?? 0) > (second.blockedUntil ?? 0) ? first : second;
  }
  return first.failedAttempts >= second.failedAttempts ? first : second;
}

function toPublicState(state: StoredAttemptLimit, now: number): PromotionCodeAttemptLimitState {
  return {
    failedAttempts: state.failedAttempts,
    remainingAttempts: Math.max(0, PROMOTION_CODE_MAX_FAILED_ATTEMPTS - state.failedAttempts),
    blockedUntil: state.blockedUntil,
    isBlocked: state.blockedUntil !== null && state.blockedUntil > now,
  };
}

function readStoredAttemptLimit(storage: Storage | null): StoredAttemptLimit {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return emptyStoredAttemptLimit();
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("failedAttempts" in value) ||
      !Number.isInteger(value.failedAttempts) ||
      (value.failedAttempts as number) < 0 ||
      (value.failedAttempts as number) > PROMOTION_CODE_MAX_FAILED_ATTEMPTS ||
      !("blockedUntil" in value) ||
      (value.blockedUntil !== null &&
        (typeof value.blockedUntil !== "number" || !Number.isFinite(value.blockedUntil))) ||
      ((value.failedAttempts as number) === PROMOTION_CODE_MAX_FAILED_ATTEMPTS) !== (value.blockedUntil !== null)
    ) {
      return emptyStoredAttemptLimit();
    }

    return {
      version: 1,
      failedAttempts: value.failedAttempts as number,
      blockedUntil: value.blockedUntil as number | null,
    };
  } catch {
    return emptyStoredAttemptLimit();
  }
}

function writeStoredAttemptLimit(storage: Storage | null, value: StoredAttemptLimit) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 保存領域を利用できない場合も、このcomponent instanceのmemory内では制限を維持する。
  }
}

function emptyStoredAttemptLimit(): StoredAttemptLimit {
  return { version: 1, failedAttempts: 0, blockedUntil: null };
}

function resolveSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
