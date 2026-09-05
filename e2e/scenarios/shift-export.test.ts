import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { getNextWeekDates } from "../helpers/date";
import { runWithE2ERuntimeSignalMonitoring } from "../helpers/runtimeSignals";
import { resetCurrentManagerScenarioData, seedManagerScenario } from "../helpers/scenarioSeeds";
import { AuthPage } from "../pages/AuthPage";
import { ShiftExportPage } from "../pages/ShiftExportPage";

type OpenRecruitmentSeed = { shopId: string; recruitmentId: string; staffId: string };

// スタッフの勤務予定を扱うため、別タブを含めbrowser artifactへ保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("シフト表出力", { tag: ["@shift-export"] }, () => {
  test.describe("管理者のダウンロード", () => {
    test.afterEach(async () => {
      await resetCurrentManagerScenarioData();
    });

    test("[E2E-EXPORT-01] シフト表から別タブを開きPDFとExcelをダウンロードする", async ({
      page,
      baseURL,
    }, testInfo) => {
      const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
        dates: getNextWeekDates(),
      });

      await test.step("管理者が募集のシフトを保存する", async () => {
        await page.goto(`/shifts/${encodeURIComponent(seed.recruitmentId)}/board`, { waitUntil: "domcontentloaded" });
        await expectAppHydrated(page);
        await expect(page.getByRole("button", { name: "下書き保存", exact: true })).toBeEnabled();
        // 既存seedは未保存の募集を作る。全員非出勤として保存し、保存済み帳票を出力する。
        await page.getByRole("button", { name: "下書き保存", exact: true }).click();
        await expect(page.getByText("下書きを保存しました", { exact: true })).toBeVisible();
      });

      await expect(page).toHaveURL(
        (url) => url.pathname === `/shifts/${seed.recruitmentId}/board` && Boolean(url.searchParams.get("org")),
      );
      const organizationId = new URL(page.url()).searchParams.get("org");
      if (!organizationId) throw new Error("Verified organization was not reflected in the board URL");

      const [exportTab] = await test.step("出力専用ページを別タブで開く", () =>
        Promise.all([
          page.waitForEvent("popup"),
          page.getByRole("button", { name: "PDF・Excel出力（別タブで開きます）", exact: true }).click(),
        ]));
      const exportPage = new ShiftExportPage(exportTab);

      await runWithE2ERuntimeSignalMonitoring({
        page: exportTab,
        testInfo,
        baseURL,
        attachmentName: "e2e-safe-browser-signals-shift-export",
        action: async () => {
          await exportPage.expectReady(organizationId, seed.recruitmentId);
          await test.step("PDFをダウンロードする", () => exportPage.download("pdf"));
          await test.step("出力ページを再読み込みしてExcelをダウンロードする", async () => {
            await exportTab.reload({ waitUntil: "domcontentloaded" });
            await exportPage.expectReady(organizationId, seed.recruitmentId);
            await exportPage.download("xlsx");
          });
        },
        cleanup: () => exportTab.close(),
      });
    });
  });

  test.describe("匿名の直URLアクセス", () => {
    test.use({ clerkTestingTokenEnabled: false, storageState: { cookies: [], origins: [] } });

    test("[E2E-EXPORT-02] 匿名で出力URLを開くと帳票を表示せずログインの戻り先へ保持する", async ({ page }) => {
      const protectedPath = "/shifts/recruitment-anonymous/export?org=organization-anonymous";

      await page.goto(protectedPath, { waitUntil: "domcontentloaded" });
      await expectAppHydrated(page);

      const authPage = new AuthPage(page);
      await authPage.expectCurrentAuthPath("/login", protectedPath);
      await authPage.expectLoginVisible();
      await new ShiftExportPage(page).expectHidden();
    });
  });
});
