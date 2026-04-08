import { test } from "@playwright/test";
import { convexRun } from "../helpers/convex";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

function seedAndGetToken(args: Record<string, unknown> = {}): string {
  convexRun("testing:clearAllTables");
  const result = convexRun("testing:seedSubmitTestData", args);
  return JSON.parse(result).token as string;
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
      await submitPage.clickEdit();
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

  test("締切後の表示確認", async () => {
    await test.step("提出済み＋締切後は閲覧のみ", async () => {
      const token = seedAndGetToken({ deadlinePassed: true, hasExistingSubmission: true });
      await submitPage.goto(token);
      await submitPage.expectReadOnlyVisible();
      await submitPage.expectSubmitButtonNotVisible();
    });

    await test.step("未提出＋締切後は締切超過メッセージ", async () => {
      const token = seedAndGetToken({ deadlinePassed: true });
      await submitPage.goto(token);
      await submitPage.expectExpiredVisible();
    });
  });
});
