import { test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { getOrCreateMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

type ShopSettingsSeed = {
  shopId: string;
  userId: string;
};

test.describe("店舗設定の提出方法・定休日反映", () => {
  test.setTimeout(60_000);

  test("勤務区分と定休日が募集作成、スタッフ提出、シフト表までつながる", async ({ page }) => {
    const dates = getNextWeekDates();
    const dashboard = new DashboardPage(page);
    const submitPage = new StaffSubmitPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const seed = seedManagerScenario<ShopSettingsSeed>("testing:seedLegalManagerConsentScenario", {
      legalConsentState: "current",
    });
    const closedDateLabel = formatDateWithWeekday(dates.dates[0]);
    const workingDateLabel = formatDateWithWeekday(dates.dates[1]);

    await test.step("店舗設定で勤務区分と毎週月曜の定休日を保存する", async () => {
      await dashboard.goto();
      await dashboard.editShopSettings({
        submissionPattern: {
          kind: "shiftType",
          options: [
            { name: "早番", startTime: "09:00", endTime: "15:00" },
            { name: "遅番", startTime: "15:00", endTime: "21:00" },
          ],
        },
        regularClosedDays: ["mon"],
      });
    });

    await test.step("募集作成時に店舗定休日が初期反映される", async () => {
      await dashboard.createRecruitment(dates, {
        expectedHolidaySummary: "1日",
        expectedHolidayDetail: closedDateLabel,
      });
    });

    await test.step("スタッフ提出画面は勤務区分UIになり、定休日は選べない", async () => {
      const token = await getOrCreateMagicLinkToken({
        shopId: seed.shopId,
        staffEmail: "tanaka@example.com",
        purpose: "submit",
      });

      await submitPage.goto(token.token);
      await submitPage.expectFormVisible();
      await submitPage.expectShopClosed(closedDateLabel);
      await submitPage.selectShiftTypeDay(workingDateLabel);
      await submitPage.expectShiftTypeOptionSelected(workingDateLabel, "早番");
      await submitPage.toggleShiftTypeOption(workingDateLabel, "遅番");
      await submitPage.expectShiftTypeOptionSelected(workingDateLabel, "遅番");
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });

    await test.step("提出した勤務区分がシフト表に反映される", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectOnShiftBoard();
      await shiftBoard.switchDateTab(1);
      await shiftBoard.expectShiftTypeOptionVisible("早番");
      await shiftBoard.expectShiftTypeOptionVisible("遅番");
    });
  });
});
