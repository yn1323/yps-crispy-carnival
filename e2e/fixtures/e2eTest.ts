import { performance } from "node:perf_hooks";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test as base, expect } from "@playwright/test";
import {
  classifyE2EFailure,
  getSafePathname,
  installSafeClerkTestingConsole,
  sanitizeDiagnosticMessage,
} from "../helpers/diagnostics";
import { type E2EClerkUser, getE2EClerkUserForWorker, setCurrentE2EClerkUserIndex } from "../helpers/e2eUsers";
import { getE2EMetrics, resetE2EMetrics } from "../helpers/metrics";

type E2ETestFixtures = {
  e2eClerkUser: string;
  e2eRunDiagnostics: undefined;
  e2eUserAnnotation: undefined;
};

type E2EWorkerFixtures = {
  e2eWorkerUser: E2EClerkUser;
};

export const test = base.extend<E2ETestFixtures, E2EWorkerFixtures>({
  e2eWorkerUser: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture destructuring even when unused.
    async ({}, use, workerInfo) => {
      const user = getE2EClerkUserForWorker(workerInfo.parallelIndex, workerInfo.config.workers);
      setCurrentE2EClerkUserIndex(user.index);
      await use(user);
    },
    { scope: "worker" },
  ],

  storageState: async ({ e2eWorkerUser }, use) => {
    await use(e2eWorkerUser.storageStatePath);
  },

  e2eClerkUser: async ({ e2eWorkerUser }, use) => {
    await use(e2eWorkerUser.email);
  },

  e2eUserAnnotation: [
    async ({ e2eWorkerUser }, use, testInfo) => {
      testInfo.annotations.push({ type: "e2e-user-index", description: String(e2eWorkerUser.index) });
      await use(undefined);
    },
    { auto: true },
  ],

  e2eRunDiagnostics: [
    async ({ e2eWorkerUser }, use, testInfo) => {
      resetE2EMetrics();
      const startedAt = performance.now();
      try {
        await use(undefined);
      } finally {
        const failureCategory = testInfo.error ? classifyE2EFailure(testInfo.error.message ?? "unknown failure") : null;
        if (failureCategory) {
          testInfo.annotations.push({ type: "failure-category", description: failureCategory });
        }
        await testInfo.attach("e2e-safe-metrics", {
          body: Buffer.from(
            JSON.stringify({
              project: testInfo.project.name,
              parallelIndex: testInfo.parallelIndex,
              userIndex: e2eWorkerUser.index,
              retry: testInfo.retry,
              durationMs: Math.round(performance.now() - startedAt),
              failureCategory,
              ...getE2EMetrics(),
            }),
          ),
          contentType: "application/json",
        });
      }
    },
    { auto: true },
  ],

  page: async ({ page }, use, testInfo) => {
    const runtimeSignals: Array<{ kind: string; message?: string; pathname?: string; status?: number }> = [];
    const restoreClerkConsole = installSafeClerkTestingConsole();
    let testError: unknown;
    let testFailed = false;
    let cleanupError: Error | undefined;
    page.on("pageerror", (error) => {
      runtimeSignals.push({ kind: "pageerror", message: sanitizeDiagnosticMessage(error.message) });
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        runtimeSignals.push({ kind: "console-error", message: sanitizeDiagnosticMessage(message.text()) });
      }
    });
    page.on("response", (response) => {
      if (response.status() < 500) return;
      const responseUrl = new URL(response.url());
      const baseUrl = testInfo.project.use.baseURL;
      if (baseUrl && responseUrl.origin !== new URL(baseUrl).origin) return;
      runtimeSignals.push({
        kind: "same-origin-5xx",
        pathname: getSafePathname(response.url()),
        status: response.status(),
      });
    });
    try {
      await setupClerkTestingToken({ page });
      await use(page);
    } catch (error) {
      testError = error;
      testFailed = true;
    }

    try {
      // Clerk testing routeを待って解除し、context終了後のretryと機密URL付きwarningを防ぐ。
      await page.context().unrouteAll({ behavior: "wait" });
    } catch {
      cleanupError = new Error("E2E Clerk route cleanup failed");
    }
    restoreClerkConsole();
    if (runtimeSignals.length > 0) {
      try {
        await testInfo.attach("e2e-safe-browser-signals", {
          body: Buffer.from(JSON.stringify(runtimeSignals.slice(0, 100))),
          contentType: "application/json",
        });
      } catch {
        cleanupError ??= new Error("E2E browser signal attachment failed");
      }
    }

    if (testFailed) throw testError;
    if (cleanupError) throw cleanupError;
  },
});

export { expect };
