export const WEB_MEASUREMENT_CONSENT_STORAGE_KEY = "shiftori_web_measurement_consent_v1";
export const WEB_MEASUREMENT_CONSENT_RELOAD_GUARD_KEY = "shiftori_web_measurement_reload_guard_v1";
const WEB_MEASUREMENT_HISTORY_GUARD_KEY = "__shiftoriWebMeasurementClosed";

export type WebMeasurementConsentDecision = "unknown" | "granted" | "denied";

export function readWebMeasurementConsent(storage: Pick<Storage, "getItem">): WebMeasurementConsentDecision {
  try {
    const value = storage.getItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : "unknown";
  } catch {
    return "unknown";
  }
}

export function writeWebMeasurementConsent(
  storage: Pick<Storage, "setItem">,
  decision: Exclude<WebMeasurementConsentDecision, "unknown">,
): boolean {
  try {
    storage.setItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY, decision);
    return true;
  } catch {
    return false;
  }
}

type ReloadGuardHistory = Pick<History, "replaceState" | "state">;

function isGuardedHistoryState(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    WEB_MEASUREMENT_HISTORY_GUARD_KEY in value &&
    (value as Record<string, unknown>)[WEB_MEASUREMENT_HISTORY_GUARD_KEY] === true
  );
}

export function hasWebMeasurementReloadGuard(
  storage: Pick<Storage, "getItem">,
  history: Pick<ReloadGuardHistory, "state">,
): boolean {
  let storageUnavailable = false;
  try {
    if (storage.getItem(WEB_MEASUREMENT_CONSENT_RELOAD_GUARD_KEY) === "closed") return true;
  } catch {
    storageUnavailable = true;
  }

  try {
    return storageUnavailable || isGuardedHistoryState(history.state);
  } catch {
    return true;
  }
}

export function writeWebMeasurementReloadGuard(
  storage: Pick<Storage, "setItem">,
  history: ReloadGuardHistory,
): boolean {
  let isGuarded = false;
  try {
    storage.setItem(WEB_MEASUREMENT_CONSENT_RELOAD_GUARD_KEY, "closed");
    isGuarded = true;
  } catch {
    // history.stateを同じtabのfallbackにする。
  }

  try {
    const currentState = typeof history.state === "object" && history.state !== null ? history.state : {};
    history.replaceState({ ...currentState, [WEB_MEASUREMENT_HISTORY_GUARD_KEY]: true }, "");
    isGuarded = true;
  } catch {
    // 呼び出し側はguardを書けなければ現在documentをreloadしない。
  }
  return isGuarded;
}

export function clearWebMeasurementReloadGuard(
  storage: Pick<Storage, "removeItem">,
  history: ReloadGuardHistory,
): void {
  try {
    storage.removeItem(WEB_MEASUREMENT_CONSENT_RELOAD_GUARD_KEY);
  } catch {
    // 次のreadでfail closedとなる。
  }

  try {
    const currentState = typeof history.state === "object" && history.state !== null ? { ...history.state } : {};
    delete (currentState as Record<string, unknown>)[WEB_MEASUREMENT_HISTORY_GUARD_KEY];
    history.replaceState(currentState, "");
  } catch {
    // 次のreadでguardが残るため計測は再開しない。
  }
}
