import { performance } from "node:perf_hooks";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { TestInfo } from "@playwright/test";
import { classifyE2EFailure, installSafeClerkTestingConsole } from "../helpers/diagnostics";
import { type E2EClerkUser, getE2EClerkUserForWorker, setCurrentE2EClerkUserIndex } from "../helpers/e2eUsers";
import { getE2EMetrics, resetE2EMetrics } from "../helpers/metrics";
import { runWithE2ERuntimeSignalMonitoring } from "../helpers/runtimeSignals";
import { artifactSafeTest as base, expect } from "./artifactSafeTest";

type E2ETestFixtures = {
  clerkTestingTokenEnabled: boolean;
  e2eClerkUser: string;
  e2eRunDiagnostics: undefined;
  e2eUserAnnotation: undefined;
};

type E2EWorkerFixtures = {
  e2eWorkerUser: E2EClerkUser;
};

const stopRuntimeMonitoringByTest = new WeakMap<TestInfo, () => void>();

export const test = base.extend<E2ETestFixtures, E2EWorkerFixtures>({
  clerkTestingTokenEnabled: [true, { option: true }],

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

  page: async ({ clerkTestingTokenEnabled, page }, use, testInfo) => {
    const restoreClerkConsole = installSafeClerkTestingConsole();
    try {
      await runWithE2ERuntimeSignalMonitoring({
        page,
        testInfo,
        baseURL: testInfo.project.use.baseURL,
        registerStop: (stop) => stopRuntimeMonitoringByTest.set(testInfo, stop),
        action: async () => {
          if (clerkTestingTokenEnabled) await setupClerkTestingToken({ page });
          await use(page);
        },
        cleanup: async () => {
          if (!clerkTestingTokenEnabled) return;
          try {
            // Clerk testing routeを待って解除し、context終了後のretryと機密URL付きwarningを防ぐ。
            await page.context().unrouteAll({ behavior: "wait" });
          } catch {
            throw new Error("E2E Clerk route cleanup failed");
          }
        },
      });
    } finally {
      stopRuntimeMonitoringByTest.delete(testInfo);
      restoreClerkConsole();
    }
  },
});

// test bodyとafterEachを製品runtimeの境界とし、actor resetなどfixture teardown中のsignalは数えない。
// biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture destructuring even when unused.
test.afterEach(({}, testInfo) => {
  stopRuntimeMonitoringByTest.get(testInfo)?.();
});

export { expect };
