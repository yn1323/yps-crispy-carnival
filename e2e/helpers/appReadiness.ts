import { expect, type Page } from "@playwright/test";

const APP_HYDRATION_TIMEOUT = 15_000;

/** SSRで見えている要素を、Reactが操作可能になる前に触らないためのready契約。 */
export async function expectAppHydrated(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-app-hydrated", "true", {
    timeout: APP_HYDRATION_TIMEOUT,
  });
}
