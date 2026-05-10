import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test as base, expect } from "@playwright/test";
import { type E2EClerkUser, getE2EClerkUserForIndex, setCurrentE2EClerkUserIndex } from "../helpers/e2eUsers";

type E2ETestFixtures = {
  e2eClerkUser: string;
};

type E2EWorkerFixtures = {
  e2eWorkerUser: E2EClerkUser;
};

export const test = base.extend<E2ETestFixtures, E2EWorkerFixtures>({
  e2eWorkerUser: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture destructuring even when unused.
    async ({}, use, workerInfo) => {
      const user = getE2EClerkUserForIndex(workerInfo.parallelIndex);
      setCurrentE2EClerkUserIndex(user.index);
      await use(user);
    },
    { scope: "worker", auto: true },
  ],

  storageState: async ({ e2eWorkerUser }, use) => {
    await use(e2eWorkerUser.storageStatePath);
  },

  e2eClerkUser: async ({ e2eWorkerUser }, use) => {
    await use(e2eWorkerUser.email);
  },

  page: async ({ page }, use) => {
    await setupClerkTestingToken({ page });
    await use(page);
  },
});

export { expect };
