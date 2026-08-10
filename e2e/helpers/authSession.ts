import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import type { E2EClerkUser } from "./e2eUsers";
import { type E2EManagerScenarioActor, getE2EManagerScenarioActorFromContext } from "./scenarioSeeds";

const CLERK_SESSION_COOKIE_PREFIX = "__session";

/** 通常coreの保存済みsessionとは別の、現在のtest contextだけに有効なsessionを作る。 */
export async function signInFreshE2EManagerSession(page: Page, user: E2EClerkUser): Promise<E2EManagerScenarioActor> {
  const existingCookies = await page.context().cookies();
  if (existingCookies.some((cookie) => cookie.name.startsWith(CLERK_SESSION_COOKIE_PREFIX))) {
    throw new Error("Fresh E2E manager sign-in requires an anonymous browser context");
  }

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  try {
    // Clerk UI自体は対象外。testing helperのticket sign-inで、このcontext専用sessionを毎回作る。
    await clerk.signIn({ page, emailAddress: user.email });
  } catch {
    // emailやprovider responseをPlaywright reportへ持ち込まない。
    throw new Error(`E2E Clerk fresh session sign-in failed: reserved-user-${user.index}`);
  }

  return await getE2EManagerScenarioActorFromContext(page.context(), user);
}
