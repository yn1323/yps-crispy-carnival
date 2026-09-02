import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import { test as base } from "../fixtures/e2eTest";
import { signInFreshE2EManagerSession } from "./authSession";
import { getE2EReservedMultiActorClerkUserForWorker } from "./e2eUsers";
import { runWithE2ERuntimeSignalMonitoring } from "./runtimeSignals";
import { type E2EManagerScenarioActor, resetManagerScenarioDataForActor } from "./scenarioSeeds";

export type E2EReservedManagerSession = {
  page: Page;
  actor: E2EManagerScenarioActor;
};

type MultiActorFixtures = {
  e2eReservedManagerSession: E2EReservedManagerSession;
};

/** 通常core actorと重ならないClerk userを、監視付きの独立contextで操作する。 */
export const multiActorTest = base.extend<MultiActorFixtures>({
  e2eReservedManagerSession: async ({ baseURL, browser, page: primaryPage }, use, testInfo) => {
    // primary page fixtureを先に開始し、Clerkのconsole redactionを2つ目のcontextにも適用する。
    void primaryPage;
    const reservedUser = getE2EReservedMultiActorClerkUserForWorker(testInfo.parallelIndex, testInfo.config.workers);
    testInfo.annotations.push({ type: "e2e-reserved-user-index", description: String(reservedUser.index) });

    const context = await browser.newContext({
      baseURL,
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    let actor: E2EManagerScenarioActor | undefined;

    await runWithE2ERuntimeSignalMonitoring({
      page,
      testInfo,
      baseURL,
      attachmentName: "e2e-safe-browser-signals-reserved-manager",
      action: async () => {
        await setupClerkTestingToken({ page });
        actor = await signInFreshE2EManagerSession(page, reservedUser);
        await use({ page, actor });
      },
      cleanup: async () => {
        let failedStage: "clerk-route" | "context" | "actor-reset" | undefined;
        try {
          await context.unrouteAll({ behavior: "wait" });
        } catch {
          failedStage = "clerk-route";
        }
        try {
          await context.close();
        } catch {
          failedStage ??= "context";
        }
        if (actor) {
          try {
            // test.afterEachでAを回収した後、fixture teardownでBを回収する。
            await resetManagerScenarioDataForActor(actor);
          } catch {
            failedStage ??= "actor-reset";
          }
        }
        if (failedStage) throw new Error(`E2E reserved manager cleanup failed: ${failedStage}`);
      },
    });
  },
});
