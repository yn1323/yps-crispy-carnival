// @vitest-environment jsdom

import type { HydrationOptions } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hydrateRoot: vi.fn(),
  initializeDocumentWebMeasurement: vi.fn(),
}));

vi.mock("@tanstack/react-start/client", () => ({ StartClient: () => null }));
vi.mock("react-dom/client", () => ({ hydrateRoot: mocks.hydrateRoot }));
vi.mock("@/src/configs/webMeasurement", () => ({
  WEB_MEASUREMENT_RUNTIME_CONFIG: {
    environment: "preview",
    gtmId: "GTM-TEST123",
    releaseId: "release-1",
    webVitalsSampleRate: 0,
  },
}));
vi.mock("@/src/lib/webMeasurement", () => ({
  initializeDocumentWebMeasurement: mocks.initializeDocumentWebMeasurement,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.hydrateRoot.mockReset();
  mocks.initializeDocumentWebMeasurement.mockReset();
  document.documentElement.innerHTML = "<head></head><body></body>";
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client root error reporting", () => {
  it("static 404 documentも計測を開始するがhydrateはしない", async () => {
    window.history.replaceState({}, "", "/__smoke-404");
    document.body.innerHTML = '<main data-static-not-found="true"></main>';

    await import("./client.tsx");

    expect(mocks.initializeDocumentWebMeasurement).toHaveBeenCalledExactlyOnceWith({
      config: expect.objectContaining({ gtmId: "GTM-TEST123" }),
      currentPathname: "/__smoke-404",
      initialDocumentPathname: "/__smoke-404",
      viewportWidth: window.innerWidth,
    });
    expect(mocks.hydrateRoot).not.toHaveBeenCalled();
  });

  it("Error Boundaryが捕捉したerrorとcomponent stackをconsoleへ渡さない", async () => {
    const rawToken = "capability_token_SENTINEL_7e07159d";
    const internalId = "document_id_SENTINEL_k57aj9s3m4q";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("./client.tsx");

    expect(mocks.initializeDocumentWebMeasurement).toHaveBeenCalledOnce();
    expect(mocks.hydrateRoot).toHaveBeenCalledOnce();
    const options = mocks.hydrateRoot.mock.calls[0]?.[2] as HydrationOptions | undefined;
    expect(options?.onCaughtError).toBeTypeOf("function");

    options?.onCaughtError?.(new Error(`query failed: ${rawToken}`), {
      componentStack: `DashboardQueryStageBoundary (${internalId})`,
    });

    expect(consoleError).toHaveBeenCalledExactlyOnceWith("Client render error", {
      errorCode: "client_render_error",
    });
    const consoleOutput = JSON.stringify(consoleError.mock.calls);
    expect(consoleOutput).not.toContain(rawToken);
    expect(consoleOutput).not.toContain(internalId);
  });
});
