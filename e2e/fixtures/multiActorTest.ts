import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { type Browser, type BrowserContext, test as base, expect, type Page } from "@playwright/test";
import { type E2EActor, type E2EClerkUser, getE2EClerkUserForActor } from "../helpers/e2eUsers";
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

async function useActorSession(
  browser: Browser,
  baseURL: string | undefined,
  actor: E2EActor,
  use: (session: MultiActorSession) => Promise<void>,
) {
  const user = getE2EClerkUserForActor(actor);
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

export const test = base.extend<MultiActorFixtures>({
  actorA: async ({ browser, baseURL }, use, testInfo) => {
    assertMultiActorProject(testInfo.project.name);
    await useActorSession(browser, baseURL, "A", use);
  },
  actorB: async ({ browser, baseURL }, use, testInfo) => {
    assertMultiActorProject(testInfo.project.name);
    await useActorSession(browser, baseURL, "B", use);
  },
  actorC: async ({ browser, baseURL }, use, testInfo) => {
    assertMultiActorProject(testInfo.project.name);
    await useActorSession(browser, baseURL, "C", use);
  },
  multiActorScenarioCleanup: [
    async ({ actorA: _actorA, actorB: _actorB, actorC: _actorC }, use) => {
      try {
        await use(undefined);
      } finally {
        resetMultiActorOrganizationScenarioData();
      }
    },
    { auto: true },
  ],
});

export { expect };
