// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetWebMeasurementForTests } from "@/src/lib/webMeasurement";
import { WEB_MEASUREMENT_CONSENT_STORAGE_KEY } from "./consentStorage";

const routerState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: routerState.pathname } }),
}));

vi.mock("@/src/configs/webMeasurement", () => ({
  WEB_MEASUREMENT_RUNTIME_CONFIG: {
    enabled: true,
    environment: "preview",
    gtmId: "GTM-TEST123",
    releaseId: "release-1",
    webVitalsSampleRate: 0,
  },
}));

vi.mock("./WebMeasurementConsentView", () => ({
  WebMeasurementConsentView: ({
    mode,
    onDeny,
    onGrant,
    onOpenSettings,
  }: {
    mode: "prompt" | "settled";
    onDeny?: () => void;
    onGrant?: () => void;
    onOpenSettings?: () => void;
  }) =>
    mode === "prompt" ? (
      <section aria-label="アクセス解析の設定">
        <button type="button" onClick={onDeny}>
          許可しない
        </button>
        <button type="button" onClick={onGrant}>
          許可する
        </button>
      </section>
    ) : (
      <button type="button" onClick={onOpenSettings}>
        設定
      </button>
    ),
}));

import { WebMeasurementConsent } from ".";

function renderConsent(reloadDocument?: () => void) {
  return render(
    <StrictMode>
      <WebMeasurementConsent reloadDocument={reloadDocument} />
    </StrictMode>,
  );
}

beforeEach(() => {
  routerState.pathname = "/";
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  resetWebMeasurementForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  resetWebMeasurementForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("WebMeasurementConsent", () => {
  it("同意前の公開documentでは設定UIだけを表示しthird-party scriptを読み込まない", async () => {
    renderConsent();

    await act(async () => undefined);

    expect(screen.getByRole("region", { name: "アクセス解析の設定" })).not.toBeNull();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it("非公開documentでは保存済み同意があってもscriptを読み込まない", async () => {
    routerState.pathname = "/shifts/submit?token=secret";
    window.localStorage.setItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY, "granted");

    renderConsent();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.queryByRole("region", { name: "アクセス解析の設定" })).toBeNull();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer ?? []).toEqual([]);
  });

  it("初回許可は同意を保存して新しいdocumentへ移り、同意前entryを現在documentから送らない", async () => {
    const reloadDocument = vi.fn();
    renderConsent(reloadDocument);
    await act(async () => undefined);

    fireEvent.click(screen.getByRole("button", { name: "許可する" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(window.localStorage.getItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY)).toBe("granted");
    expect(reloadDocument).toHaveBeenCalledOnce();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer ?? []).toEqual([]);
  });

  it("許可済みの公開documentは初回描画後に一度だけ初期化する", async () => {
    window.localStorage.setItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY, "granted");

    renderConsent();
    await act(async () => undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(document.head.querySelectorAll('script[src*="googletagmanager"]').length).toBe(1);
    expect(window.dataLayer?.filter((event) => event.event === "page_view")).toHaveLength(1);
  });

  it("activeな許可を取り消すと保存後にruntimeを止めてreloadする", async () => {
    const reloadDocument = vi.fn();
    window.localStorage.setItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY, "granted");
    renderConsent(reloadDocument);
    await act(async () => undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    fireEvent.click(screen.getByRole("button", { name: "設定" }));
    fireEvent.click(screen.getByRole("button", { name: "許可しない" }));

    expect(window.localStorage.getItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY)).toBe("denied");
    expect(reloadDocument).toHaveBeenCalledOnce();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer ?? []).toEqual([]);
  });

  it("revoke保存失敗時は確定deniedにせず、reload後もstaleなgrantedから再起動しない", async () => {
    const reloadDocument = vi.fn();
    window.localStorage.setItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY, "granted");
    const rendered = renderConsent(reloadDocument);
    await act(async () => undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    fireEvent.click(screen.getByRole("button", { name: "設定" }));

    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (this === window.localStorage && key === WEB_MEASUREMENT_CONSENT_STORAGE_KEY) {
        throw new Error("consent storage unavailable");
      }
      return originalSetItem.call(this, key, value);
    });
    fireEvent.click(screen.getByRole("button", { name: "許可しない" }));

    expect(window.localStorage.getItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY)).toBe("granted");
    expect(reloadDocument).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "アクセス解析の設定" })).not.toBeNull();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();

    rendered.unmount();
    resetWebMeasurementForTests();
    vi.restoreAllMocks();
    renderConsent(reloadDocument);
    await act(async () => undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(window.localStorage.getItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY)).toBe("granted");
    expect(screen.getByRole("region", { name: "アクセス解析の設定" })).not.toBeNull();
    expect(reloadDocument).toHaveBeenCalledOnce();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer ?? []).toEqual([]);
  });

  it.each(["granted", "denied", null, "invalid"])(
    "別tabのconsent変更 %s は現在runtimeを止め、新documentだけで再評価する",
    async (newValue) => {
      const reloadDocument = vi.fn();
      window.localStorage.setItem(WEB_MEASUREMENT_CONSENT_STORAGE_KEY, "granted");
      const rendered = renderConsent(reloadDocument);
      await act(async () => undefined);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: WEB_MEASUREMENT_CONSENT_STORAGE_KEY,
            newValue,
            storageArea: window.localStorage,
          }),
        );
      });

      expect(reloadDocument).toHaveBeenCalledOnce();
      expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
      expect(window.dataLayer ?? []).toEqual([]);

      rendered.unmount();
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: WEB_MEASUREMENT_CONSENT_STORAGE_KEY,
            newValue,
            storageArea: window.localStorage,
          }),
        );
      });
      expect(reloadDocument).toHaveBeenCalledOnce();
    },
  );
});
