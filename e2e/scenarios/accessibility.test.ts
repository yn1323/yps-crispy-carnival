import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";

type AccessibilityScenarioSeed = {
  shopId: string;
};

// Dashboardへmanager emailが表示されるため、browser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("認証済み画面のアクセシビリティ", { tag: ["@e2e-a11y"] }, () => {
  test("[E2E-A11Y-01] Dashboardの主要ランドマークに重大なaxe違反がない", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<AccessibilityScenarioSeed>("testing:seedNotificationSubmitScenario", {
      dates,
    });
    const dashboard = new DashboardPage(page);
    await dashboard.goto(seed.shopId);
    await dashboard.expectStaffVisible("田中太郎");

    const result = await new AxeBuilder({ page }).analyze();
    const violations = result.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.flatMap((node) => node.target),
      }));

    expect(violations).toEqual([]);
  });
});
