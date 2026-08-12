// @vitest-environment jsdom

import type { HydrationOptions } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hydrateRoot: vi.fn(),
}));

vi.mock("@tanstack/react-start/client", () => ({ StartClient: () => null }));
vi.mock("react-dom/client", () => ({ hydrateRoot: mocks.hydrateRoot }));

beforeEach(() => {
  vi.resetModules();
  mocks.hydrateRoot.mockReset();
  document.documentElement.innerHTML = "<head></head><body></body>";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client root error reporting", () => {
  it("static 404 documentはhydrateしない", async () => {
    document.body.innerHTML = '<main data-static-not-found="true"></main>';

    await import("./client.tsx");

    expect(mocks.hydrateRoot).not.toHaveBeenCalled();
  });

  it("Error Boundaryが捕捉したerrorとcomponent stackをconsoleへ渡さない", async () => {
    const rawToken = "capability_token_SENTINEL_7e07159d";
    const internalId = "document_id_SENTINEL_k57aj9s3m4q";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await import("./client.tsx");

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
