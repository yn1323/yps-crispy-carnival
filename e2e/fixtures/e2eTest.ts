import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test as base, expect } from "@playwright/test";
import { type E2EClerkUser, getE2EClerkUserForWorkerTest, setCurrentE2EClerkUserIndex } from "../helpers/e2eUsers";

const NOTIFICATION_TEST_TIMEOUT_MS = 150_000;

type E2ETestFixtures = {
  e2eClerkUser: string;
  e2eUserAnnotation: undefined;
  e2eWorkerUser: E2EClerkUser;
};

type E2EWorkerFixtures = {
  nextE2EClerkUser: () => E2EClerkUser;
};

export const test = base.extend<E2ETestFixtures, E2EWorkerFixtures>({
  nextE2EClerkUser: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture destructuring even when unused.
    async ({}, use, workerInfo) => {
      let testOrdinal = 0;
      await use(() => {
        const user = getE2EClerkUserForWorkerTest(workerInfo.parallelIndex, workerInfo.config.workers, testOrdinal);
        testOrdinal += 1;
        return user;
      });
    },
    { scope: "worker", auto: true },
  ],

  e2eWorkerUser: async ({ nextE2EClerkUser }, use) => {
    const user = nextE2EClerkUser();
    setCurrentE2EClerkUserIndex(user.index);
    await use(user);
  },

  storageState: async ({ e2eWorkerUser }, use) => {
    await use(e2eWorkerUser.storageStatePath);
  },

  e2eClerkUser: async ({ e2eWorkerUser }, use) => {
    await use(e2eWorkerUser.email);
  },

  e2eUserAnnotation: [
    async ({ e2eWorkerUser }, use, testInfo) => {
      testInfo.annotations.push({ type: "e2e-user-index", description: String(e2eWorkerUser.index) });
      // 6 worker時は通知probeのConvex CLI呼び出しが重なるため、実測時間は結果ゲートで監視しつつ上限だけ校正する。
      if (testInfo.tags.includes("@notification") && testInfo.timeout < NOTIFICATION_TEST_TIMEOUT_MS) {
        testInfo.setTimeout(NOTIFICATION_TEST_TIMEOUT_MS);
      }
      await use(undefined);
    },
    { auto: true },
  ],

  page: async ({ page }, use) => {
    await setupClerkTestingToken({ page });
    await use(page);
  },
});

export { expect };
