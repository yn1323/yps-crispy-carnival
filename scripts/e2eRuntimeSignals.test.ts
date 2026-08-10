import type { Page, TestInfo } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import {
  installE2EReactCallerDiagnostic,
  isAllowedE2EConsoleError,
  runWithE2ERuntimeSignalMonitoring,
} from "../e2e/helpers/runtimeSignals";

type RuntimeEventHandler = (event: unknown) => void;

class FakePage {
  private listeners = new Map<string, Set<RuntimeEventHandler>>();
  initScriptCalls = 0;

  async addInitScript() {
    this.initScriptCalls += 1;
  }

  on(event: string, handler: RuntimeEventHandler) {
    const handlers = this.listeners.get(event) ?? new Set<RuntimeEventHandler>();
    handlers.add(handler);
    this.listeners.set(event, handlers);
  }

  off(event: string, handler: RuntimeEventHandler) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, value: unknown) {
    for (const handler of this.listeners.get(event) ?? []) handler(value);
  }
}

const SSR_WARNING =
  'The pseudo class ":first-child" is potentially unsafe when doing server-side rendering. Try changing it to ":first-of-type".';

describe("E2E browser runtime signals", () => {
  it("React lifecycle診断は対象warningだけを短縮し、caller位置を残して多重installしない", () => {
    const targetMessage = "target React warning";
    const callerMarker = "[caller]";
    const forwardedError = vi.fn();
    const originalConsoleError = console.error;
    const stackLines = [
      "Error",
      "    at wrapper (https://preview.example.test/assets/runtime.js?v=private:1:2)",
      "    at reactWarn (https://preview.example.test/assets/react.js?v=private:3:4)",
      "    at schedule (https://preview.example.test/assets/react.js?v=private:5:6)",
      "    at dispatch (https://preview.example.test/assets/react.js?v=private:7:8)",
      "    at intermediateA (https://preview.example.test/assets/app.js?v=private:9:10)",
      "    at intermediateB (https://preview.example.test/assets/app.js?v=private:11:12)",
      "    at intermediateC (https://preview.example.test/assets/app.js?v=private:13:14)",
      "    at updateOwner (https://preview.example.test/src/useMembership.tsx?t=private:15:16)",
      "    at asyncCaller (https://preview.example.test/src/ShopDetail.tsx?t=private:17:18)",
    ];
    class DiagnosticError {
      stack = stackLines.join("\n");
    }

    vi.stubGlobal("window", {});
    vi.stubGlobal("Error", DiagnosticError);
    console.error = forwardedError;
    let installedError: typeof console.error;
    try {
      installE2EReactCallerDiagnostic({ callerMarker, targetMessage });
      installedError = console.error;
      installE2EReactCallerDiagnostic({ callerMarker, targetMessage });
      expect(console.error).toBe(installedError);
      console.error("ordinary error", { code: 42 });
      console.error(targetMessage);
    } finally {
      console.error = originalConsoleError;
      vi.unstubAllGlobals();
    }

    expect(forwardedError.mock.calls[0]).toEqual(["ordinary error", { code: 42 }]);
    expect(forwardedError.mock.calls[1]?.[1]).toBe(targetMessage);
    const diagnostic = String(forwardedError.mock.calls[1]?.[0]);
    expect(diagnostic).toContain(callerMarker);
    expect(diagnostic).toContain("/assets/react.js:3:4");
    expect(diagnostic).toContain("/src/ShopDetail.tsx:17:18");
    expect(diagnostic).not.toContain("preview.example.test");
    expect(diagnostic).not.toContain("private");
  });

  it("既知のSSR警告だけを完全一致で許容する", () => {
    expect(isAllowedE2EConsoleError(SSR_WARNING)).toBe(true);
    expect(isAllowedE2EConsoleError(` ${SSR_WARNING}`)).toBe(false);
    expect(isAllowedE2EConsoleError(`${SSR_WARNING} another error`)).toBe(false);
  });

  it("runtime signalをsanitizationして添付し、signalの件数だけで失敗する", async () => {
    const page = new FakePage();
    const attach = vi.fn(async (_name: string, _options: { body: Buffer; contentType: string }) => undefined);
    const rawEmail = "person@example.test";
    const rawToken = "private-capability";

    await expect(
      runWithE2ERuntimeSignalMonitoring({
        page: page as unknown as Page,
        testInfo: { attach } as unknown as Pick<TestInfo, "attach">,
        baseURL: "https://app.example.test",
        action: async () => {
          page.emit("response", {
            status: () => 503,
            url: () => `https://app.example.test/api/${rawEmail}?token=${rawToken}`,
          });
        },
      }),
    ).rejects.toThrow("same-origin-5xx=1");
    expect(page.initScriptCalls).toBe(1);

    const attachment = attach.mock.calls[0]?.[1];
    expect(attachment).toBeDefined();
    if (!attachment) throw new Error("safe runtime signal attachment was not created");
    const attachedBody = attachment.body.toString("utf-8");
    expect(attachedBody).toContain("[email-redacted]");
    expect(attachedBody).not.toContain(rawEmail);
    expect(attachedBody).not.toContain(rawToken);
  });

  it.each([
    {
      label: "pageerror",
      emit: (page: FakePage) => page.emit("pageerror", new Error("render failed")),
      expected: "pageerror=1",
    },
    {
      label: "allowlist外console.error",
      emit: (page: FakePage) => page.emit("console", { type: () => "error", text: () => "unexpected console error" }),
      expected: "console-error=1",
    },
  ])("$labelを単独で検知して失敗する", async ({ emit, expected }) => {
    const page = new FakePage();
    const attach = vi.fn(async (_name: string, _options: { body: Buffer; contentType: string }) => undefined);

    await expect(
      runWithE2ERuntimeSignalMonitoring({
        page: page as unknown as Page,
        testInfo: { attach } as unknown as Pick<TestInfo, "attach">,
        action: async () => emit(page),
      }),
    ).rejects.toThrow(expected);
    expect(attach).toHaveBeenCalledOnce();
  });

  it("signal stormでも詳細を100件に制限し、kind別の総数は維持する", async () => {
    const page = new FakePage();
    const attach = vi.fn(async (_name: string, _options: { body: Buffer; contentType: string }) => undefined);

    await expect(
      runWithE2ERuntimeSignalMonitoring({
        page: page as unknown as Page,
        testInfo: { attach } as unknown as Pick<TestInfo, "attach">,
        action: async () => {
          for (let index = 0; index < 125; index += 1) {
            page.emit("console", { type: () => "error", text: () => `console failure ${index}` });
          }
          for (let index = 0; index < 30; index += 1) {
            page.emit("pageerror", new Error(`page failure ${index}`));
          }
        },
      }),
    ).rejects.toThrow("console-error=125, pageerror=30");

    const attachment = attach.mock.calls[0]?.[1];
    expect(attachment).toBeDefined();
    if (!attachment) throw new Error("safe runtime signal attachment was not created");
    const attached = JSON.parse(attachment.body.toString("utf-8")) as {
      signals: unknown[];
      totals: Record<string, number>;
    };
    expect(attached.signals).toHaveLength(100);
    expect(attached.totals).toEqual({ "console-error": 125, pageerror: 30 });
  });

  it("元のtest errorをruntime signalやcleanup errorで上書きしない", async () => {
    const page = new FakePage();
    const attach = vi.fn(async (_name: string, _options: { body: Buffer; contentType: string }) => undefined);
    const assertionError = new Error("original assertion failure");
    const rawEmail = "person@example.test";

    await expect(
      runWithE2ERuntimeSignalMonitoring({
        page: page as unknown as Page,
        testInfo: { attach } as unknown as Pick<TestInfo, "attach">,
        action: async () => {
          page.emit("pageerror", new Error(`runtime failure for ${rawEmail}`));
          throw assertionError;
        },
        cleanup: async () => {
          throw new Error("cleanup failure");
        },
      }),
    ).rejects.toBe(assertionError);

    const attachment = attach.mock.calls[0]?.[1];
    expect(attachment).toBeDefined();
    if (!attachment) throw new Error("safe runtime signal attachment was not created");
    expect(attachment.body.toString("utf-8")).not.toContain(rawEmail);
  });

  it("cleanup開始前にlistenerを解除し、browser破棄中のsignalをruntime regressionへ数えない", async () => {
    const page = new FakePage();
    const attach = vi.fn(async (_name: string, _options: { body: Buffer; contentType: string }) => undefined);

    await expect(
      runWithE2ERuntimeSignalMonitoring({
        page: page as unknown as Page,
        testInfo: { attach } as unknown as Pick<TestInfo, "attach">,
        action: async () => "completed",
        cleanup: async () => {
          page.emit("console", { type: () => "error", text: () => "teardown warning" });
          page.emit("pageerror", new Error("teardown failure"));
        },
      }),
    ).resolves.toBe("completed");
    expect(attach).not.toHaveBeenCalled();
  });

  it("外部のtest body境界でlistenerを解除し、後続fixture teardownのsignalを数えない", async () => {
    const page = new FakePage();
    const attach = vi.fn(async (_name: string, _options: { body: Buffer; contentType: string }) => undefined);
    let stopMonitoring: (() => void) | undefined;

    await expect(
      runWithE2ERuntimeSignalMonitoring({
        page: page as unknown as Page,
        testInfo: { attach } as unknown as Pick<TestInfo, "attach">,
        registerStop: (stop) => {
          stopMonitoring = stop;
        },
        action: async () => {
          stopMonitoring?.();
          page.emit("console", { type: () => "error", text: () => "fixture teardown warning" });
          return "completed";
        },
      }),
    ).resolves.toBe("completed");
    expect(attach).not.toHaveBeenCalled();
  });

  it("listener解除後もcleanup自体の失敗は失敗として返す", async () => {
    const page = new FakePage();
    const cleanupError = new Error("cleanup failed");

    await expect(
      runWithE2ERuntimeSignalMonitoring({
        page: page as unknown as Page,
        testInfo: { attach: vi.fn() } as unknown as Pick<TestInfo, "attach">,
        action: async () => "completed",
        cleanup: async () => {
          throw cleanupError;
        },
      }),
    ).rejects.toBe(cleanupError);
  });

  it("許容済みconsole errorとcross-origin 5xxでは失敗しない", async () => {
    const page = new FakePage();
    const attach = vi.fn(async (_name: string, _options: { body: Buffer; contentType: string }) => undefined);

    await expect(
      runWithE2ERuntimeSignalMonitoring({
        page: page as unknown as Page,
        testInfo: { attach } as unknown as Pick<TestInfo, "attach">,
        baseURL: "https://app.example.test",
        action: async () => {
          page.emit("console", { type: () => "error", text: () => SSR_WARNING });
          page.emit("response", { status: () => 503, url: () => "https://provider.example.test/api" });
          return "completed";
        },
      }),
    ).resolves.toBe("completed");
    expect(attach).not.toHaveBeenCalled();
  });
});
