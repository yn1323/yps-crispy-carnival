// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWebMeasurementReloadGuard,
  hasWebMeasurementReloadGuard,
  readWebMeasurementConsent,
  WEB_MEASUREMENT_CONSENT_STORAGE_KEY,
  writeWebMeasurementConsent,
  writeWebMeasurementReloadGuard,
} from "./consentStorage";

describe("Web計測Consent storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("未選択・未知形式は許可へ推測しない", () => {
    expect(readWebMeasurementConsent(localStorage)).toBe("unknown");
    localStorage.setItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY, JSON.stringify({ analytics: "granted" }));
    expect(readWebMeasurementConsent(localStorage)).toBe("unknown");
  });

  it.each(["granted", "denied"] as const)("%sだけをversioned keyへ保存する", (decision) => {
    expect(writeWebMeasurementConsent(localStorage, decision)).toBe(true);
    expect(readWebMeasurementConsent(localStorage)).toBe(decision);
  });

  it("storage例外時もdefault closedへ戻る", () => {
    const failingStorage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };
    expect(readWebMeasurementConsent(failingStorage)).toBe("unknown");
    expect(writeWebMeasurementConsent(failingStorage, "granted")).toBe(false);
  });

  it("revoke失敗guardは同じtabで維持し、明示的に消すまで計測を閉じる", () => {
    expect(hasWebMeasurementReloadGuard(sessionStorage, window.history)).toBe(false);
    expect(writeWebMeasurementReloadGuard(sessionStorage, window.history)).toBe(true);
    expect(hasWebMeasurementReloadGuard(sessionStorage, window.history)).toBe(true);

    clearWebMeasurementReloadGuard(sessionStorage, window.history);
    expect(hasWebMeasurementReloadGuard(sessionStorage, window.history)).toBe(false);
  });

  it("sessionStorageへguardを書けなくてもhistory.stateをfallbackにする", () => {
    const unavailableStorage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      removeItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };

    expect(writeWebMeasurementReloadGuard(unavailableStorage, window.history)).toBe(true);
    expect(hasWebMeasurementReloadGuard(sessionStorage, window.history)).toBe(true);
  });
});
