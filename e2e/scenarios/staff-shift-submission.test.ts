import { test } from "../fixtures/e2eTest";
import { convexRunJson } from "../helpers/convex";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

function seedAndGetToken(args: Record<string, unknown> = {}): string {
  return convexRunJson<{ token: string }>("testing:seedSubmitTestData", args).token;
}

test.describe("スタッフのシフト希望提出", () => {
  test.setTimeout(30_000);
  let submitPage: StaffSubmitPage;

  test.beforeEach(async ({ page }) => {
    submitPage = new StaffSubmitPage(page);
  });

  test("未提出→提出→修正→再提出のハッピーパス", async () => {
    const token = seedAndGetToken();

    await test.step("Step 1: 未提出フォームを開く", async () => {
      await submitPage.goto(token);
      await submitPage.expectFormVisible();
      await submitPage.expectUnsubmittedBadge();
      await submitPage.expectDayOff("4/7(火)");
      await submitPage.expectDayOff("4/13(月)");
    });

    await test.step("Step 2: 出勤日を選択して提出する", async () => {
      await submitPage.toggleDay("4/7(火)");
      await submitPage.toggleDay("4/9(木)");
      await submitPage.toggleDay("4/11(土)");

      await submitPage.expectDayWorking("4/7(火)");
      await submitPage.expectDayWorking("4/9(木)");
      await submitPage.expectDayWorking("4/11(土)");
      await submitPage.expectDayOff("4/8(水)");

      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });

    await test.step("Step 3: 修正して再提出する", async () => {
      await submitPage.goto(token);
      await submitPage.expectFormVisible();
      await submitPage.expectSubmittedBadge();

      await submitPage.expectDayWorking("4/7(火)");
      await submitPage.expectDayWorking("4/9(木)");

      await submitPage.clearDay("4/7(火)");
      await submitPage.toggleDay("4/10(金)");

      await submitPage.expectDayOff("4/7(火)");
      await submitPage.expectDayWorking("4/10(金)");

      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });
  });

  test("日付のみ提出の短いハッピーパス", async () => {
    const token = seedAndGetToken({
      submissionPattern: { kind: "dateOnly" },
      shopClosedDates: ["2026-04-08"],
    });

    await submitPage.goto(token);
    await submitPage.expectFormVisible();
    await submitPage.expectShopClosed("4/8(水)");

    await submitPage.toggleDay("4/7(火)");
    await submitPage.expectDateWorking("4/7(火)");
    await submitPage.expectDayOff("4/9(木)");

    await submitPage.submit();
    await submitPage.expectCompletionVisible();
  });

  test("勤務区分提出の短いハッピーパス", async () => {
    const token = seedAndGetToken({
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
        ],
      },
    });

    await submitPage.goto(token);
    await submitPage.expectFormVisible();

    await submitPage.selectShiftTypeDay("4/7(火)");
    await submitPage.expectShiftTypeOptionSelected("4/7(火)", "早番");
    await submitPage.toggleShiftTypeOption("4/7(火)", "遅番");
    await submitPage.expectShiftTypeOptionSelected("4/7(火)", "遅番");

    await submitPage.submit();
    await submitPage.expectCompletionVisible();
  });
});
