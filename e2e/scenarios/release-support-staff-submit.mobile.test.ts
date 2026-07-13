import { test } from "../fixtures/e2eTest";
import { convexRunJson } from "../helpers/convex";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

test.describe("スタッフ提出のモバイル回帰", { tag: ["@release", "@mobile"] }, () => {
  test("スマートフォンで希望日を選び提出を完了できる", async ({ page }) => {
    const { token } = convexRunJson<{ token: string }>("testing:seedSubmitTestData", {
      submissionPattern: { kind: "dateOnly" },
    });
    const submitPage = new StaffSubmitPage(page);

    await test.step("Step 1: モバイル幅で提出フォームを開く", async () => {
      await submitPage.goto(token);
      await submitPage.expectFormVisible();
      await submitPage.expectUnsubmittedBadge();
    });

    await test.step("Step 2: 希望日を選択して提出する", async () => {
      await submitPage.toggleDay("4/7(火)");
      await submitPage.expectDateWorking("4/7(火)");
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });
  });
});
