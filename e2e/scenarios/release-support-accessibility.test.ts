import { expect, test } from "../fixtures/e2eTest";
import { expectNoA11yViolations } from "../helpers/accessibility";
import { convexRunJson } from "../helpers/convex";
import { getNextWeekDates } from "../helpers/date";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

test.describe("主要ページのaxeアクセシビリティ検査", { tag: ["@release", "@a11y"] }, () => {
  test.setTimeout(45_000);

  test("公開TOPに既知のコントラスト課題以外のWCAG違反がない", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoA11yViolations(page, testInfo, {
      knownRuleGaps: {
        // TODO: teal.600背景のCTAとFooter文字を、通常テキストで4.5:1を満たす配色へ更新する。
        "color-contrast": {
          reason: "公開TOPのCTA・Footerでteal.600背景と白系文字のコントラストが不足",
          targets: [
            ".css-15h55eu",
            ".css-11yivoa",
            ".css-m4vd9a",
            ".css-1s13phv > span",
            ".css-138hvdw",
            ".css-1eo32r8.chakra-stack:nth-child(2) > .css-8puo4c",
            '.css-1eo32r8.chakra-stack:nth-child(2) > a[href$="features"]',
            ".css-1eo32r8.chakra-stack:nth-child(3) > .css-8puo4c",
            'a[href$="howto"]',
            'footer a[href="/faq"]',
            'a[href$="contact"]',
            ".css-1eo32r8.chakra-stack:nth-child(4) > .css-8puo4c",
            'a[href$="terms"]',
            'a[href$="privacy"]',
            ".css-ajz6ev > span",
          ],
        },
      },
    });
  });

  test("Dashboardに既知のコントラスト課題以外のWCAG違反がない", async ({ page }, testInfo) => {
    seedManagerScenario("testing:seedOpenRecruitmentNotificationScenario", { dates: getNextWeekDates() });
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectRecruitmentCardVisible();
    await expectNoA11yViolations(page, testInfo, {
      knownRuleGaps: {
        // TODO: Dashboardのteal系アクションと補助文字をWCAG AAのコントラストへ更新する。
        "color-contrast": {
          reason: "Dashboardのteal系アクションと補助文字のコントラストが不足",
          targets: [".css-ofadoy"],
        },
      },
    });
  });

  test("スタッフ提出画面に既知のコントラスト課題以外のWCAG違反がない", async ({ page }, testInfo) => {
    const { token } = convexRunJson<{ token: string }>("testing:seedSubmitTestData", {
      submissionPattern: { kind: "dateOnly" },
    });
    const submitPage = new StaffSubmitPage(page);
    await submitPage.goto(token);
    await submitPage.expectFormVisible();
    await expectNoA11yViolations(page, testInfo, {
      knownRuleGaps: {
        // TODO: スタッフ提出画面のteal系アクションをWCAG AAのコントラストへ更新する。
        "color-contrast": {
          reason: "スタッフ提出画面のteal系アクションのコントラストが不足",
          targets: [".css-12pybrw"],
        },
      },
    });
  });
});
