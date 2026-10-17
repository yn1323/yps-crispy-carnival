import { expect, test } from "../fixtures/e2eTest";
import { withAnonymousStaffPage } from "../helpers/anonymousStaffPage";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { createMagicLinkTokenForLatestRecruitment } from "../helpers/notificationTokens";
import { runWithE2ERuntimeSignalMonitoring } from "../helpers/runtimeSignals";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { ShiftExportPage } from "../pages/ShiftExportPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

type OpenRecruitmentSeed = {
  organizationId: string;
  recruitmentId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "追加通知テスト店舗";
const STAFF_NAME = "田中太郎";
const WORKING_DAY_NOTE = "17時以降なら入れます";
const DAY_OFF_NOTE = "テスト期間のため休みたいです";

// bearer capabilityとスタッフが書いた自由入力を扱うため、URLや本文を保持し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("希望シフトの日付メモ", { tag: ["@e2e-core", "@capability"] }, () => {
  // 匿名提出の往復、シフト表の表示、出力タブへの受け渡しを含む。近い契約の実測へ余裕を加えた失敗上限。
  test.setTimeout(90_000);

  test("[E2E-NOTE-01] 匿名スタッフが日付メモを添えて提出し、シフト表と出力のメモ一覧で確認できる", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const [firstDate, secondDate] = dates.dates.map(formatDateWithWeekday);
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      dateOnly: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);
    const submitCapability = createMagicLinkTokenForLatestRecruitment({
      recruitmentId: seed.recruitmentId,
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });

    await test.step("匿名スタッフが出勤希望の日と休みの日にメモを添えて提出し、同じリンクで保存済みのメモを開ける", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-date-notes",
        action: async (anonymousPage) => {
          const submitPage = new StaffSubmitPage(anonymousPage);
          await submitPage.goto(submitCapability.token);
          await submitPage.expectFormVisible();
          await submitPage.toggleDay(firstDate);
          await submitPage.writeDateNote(firstDate, WORKING_DAY_NOTE);
          await submitPage.writeDateNote(secondDate, DAY_OFF_NOTE);
          await submitPage.submit();
          await submitPage.expectCompletionVisible();

          await submitPage.goto(submitCapability.token);
          await submitPage.expectDateNote(firstDate, WORKING_DAY_NOTE);
          await submitPage.expectDateNote(secondDate, DAY_OFF_NOTE);
        },
      });
    });

    await test.step("管理者のシフト表で、並べ替えた日のメモ欄にスタッフのメモが表示される", async () => {
      const appShifts = new AppShiftsPage(page);
      const shiftBoard = new ShiftBoardPage(page);
      await appShifts.goto(seed.organizationId);
      await appShifts.openRecruitment({ ...dates, shopName: SCENARIO_SHOP_NAME });
      await shiftBoard.expectDateOnlyNotesForDate(firstDate, [{ staffName: STAFF_NAME, note: WORKING_DAY_NOTE }]);
      await shiftBoard.expectDateOnlyNotesForDate(secondDate, [{ staffName: STAFF_NAME, note: DAY_OFF_NOTE }]);
    });

    const [exportTab] = await test.step("出力専用ページを別タブで開く", () =>
      Promise.all([
        page.waitForEvent("popup"),
        page.getByRole("button", { name: "PDF・Excel（別タブで開きます）", exact: true }).click(),
      ]));
    const exportPage = new ShiftExportPage(exportTab);

    await runWithE2ERuntimeSignalMonitoring({
      page: exportTab,
      testInfo,
      baseURL,
      attachmentName: "e2e-safe-browser-signals-date-notes-export",
      action: async () => {
        await exportPage.expectReady(seed.organizationId, seed.recruitmentId);
        await test.step("出力タブでメモ一覧を付けると、受け渡したメモが日付・名前と並ぶ", () =>
          exportPage.includeDateNotes([
            { dateText: firstDate, staffName: STAFF_NAME, note: WORKING_DAY_NOTE },
            { dateText: secondDate, staffName: STAFF_NAME, note: DAY_OFF_NOTE },
          ]));
        await expect(exportTab.getByRole("table", { name: "シフト表" }).first()).not.toContainText(WORKING_DAY_NOTE);
      },
      cleanup: () => exportTab.close(),
    });
  });
});
