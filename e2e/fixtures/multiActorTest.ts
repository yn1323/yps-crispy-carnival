import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Browser, type BrowserContext, test as base, expect, type Page } from "@playwright/test";
import {
  type E2EActor,
  type E2EActorPool,
  type E2EClerkUser,
  getE2EActorPool,
  getE2EClerkUserForActor,
} from "../helpers/e2eUsers";
import { resetMultiActorOrganizationScenarioData } from "../helpers/scenarioSeeds";

const MULTI_ACTOR_PROJECT_NAME = "multi-actor-chromium";

export type MultiActorSession = E2EClerkUser & {
  context: BrowserContext;
  page: Page;
};

type MultiActorFixtures = {
  actorA: MultiActorSession;
  actorB: MultiActorSession;
  actorC: MultiActorSession;
  multiActorScenarioCleanup: undefined;
};

type MultiActorWorkerFixtures = {
  multiActorPool: E2EActorPool;
};

async function useActorSession(
  browser: Browser,
  baseURL: string | undefined,
  pool: E2EActorPool,
  actor: E2EActor,
  use: (session: MultiActorSession) => Promise<void>,
) {
  const user = getE2EClerkUserForActor(actor, pool.index);
  const context = await browser.newContext({
    baseURL,
    storageState: user.storageStatePath,
  });
  let page: Page | undefined;

  try {
    page = await context.newPage();
    await setupClerkTestingToken({ page });
    await use({ ...user, context, page });
  } finally {
    try {
      if (page && !page.isClosed()) await page.close();
    } finally {
      await context.close();
    }
  }
}

function assertMultiActorProject(projectName: string) {
  if (projectName !== MULTI_ACTOR_PROJECT_NAME) {
    throw new Error(`Multi-actor fixtures must run in the ${MULTI_ACTOR_PROJECT_NAME} project.`);
  }
}

export const test = base.extend<MultiActorFixtures, MultiActorWorkerFixtures>({
  multiActorPool: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires fixture destructuring even when unused.
    async ({}, use, workerInfo) => {
      assertMultiActorProject(workerInfo.project.name);
      await use(getE2EActorPool(workerInfo.parallelIndex));
    },
    { scope: "worker" },
  ],

  actorA: async ({ browser, baseURL, multiActorPool }, use, testInfo) => {
    assertMultiActorProject(testInfo.project.name);
    await useActorSession(browser, baseURL, multiActorPool, "A", use);
  },
  actorB: async ({ browser, baseURL, multiActorPool }, use, testInfo) => {
    assertMultiActorProject(testInfo.project.name);
    await useActorSession(browser, baseURL, multiActorPool, "B", use);
  },
  actorC: async ({ browser, baseURL, multiActorPool }, use, testInfo) => {
    assertMultiActorProject(testInfo.project.name);
    await useActorSession(browser, baseURL, multiActorPool, "C", use);
  },
  multiActorScenarioCleanup: [
    // actor fixtureへ依存させず、使用していないactorのbrowser contextを作らない。
    async ({ multiActorPool }, use, testInfo) => {
      testInfo.annotations.push({ type: "e2e-actor-pool", description: String(multiActorPool.index) });
      try {
        await use(undefined);
      } finally {
        await resetMultiActorOrganizationScenarioData(multiActorPool);
      }
    },
    { auto: true },
  ],
});

export { expect };
