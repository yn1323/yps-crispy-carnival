import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

export class ShiftExportPage {
  constructor(private page: Page) {}

  async expectReady(organizationId: string, recruitmentId: string) {
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) => url.pathname === `/shifts/${recruitmentId}/export` && url.searchParams.get("org") === organizationId,
    );
    await expect(this.page.getByRole("region", { name: "シフト表プレビュー" })).toBeVisible();
    await expect(this.page.getByRole("button", { name: "PDF", exact: true })).toBeEnabled();
    await expect(this.page.getByRole("button", { name: "Excel", exact: true })).toBeEnabled();
  }

  async download(format: "pdf" | "xlsx") {
    const name = format === "pdf" ? "PDF" : "Excel";
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.page.getByRole("button", { name, exact: true }).click(),
    ]);

    try {
      expect(await download.failure()).toBeNull();
      expect(download.suggestedFilename()).toMatch(format === "pdf" ? /\.pdf$/ : /\.xlsx$/);
      const stream = await download.createReadStream();
      let receivedBytes = 0;
      for await (const chunk of stream) receivedBytes += chunk.length;
      expect(receivedBytes).toBeGreaterThan(0);
    } finally {
      // 合成fixtureの帳票もreportへ添付せず、ブラウザが保存した一時ファイルを回収する。
      await download.delete();
    }
  }

  /** 初期状態では連絡事項を出力せず、選んだときだけ日付・名前・メモの一覧を帳票へ加える。 */
  async includeDateNotes(notes: Array<{ dateText: string; staffName: string; note: string }>) {
    const checkbox = this.page.getByRole("checkbox", { name: "連絡事項も出力する" });
    await expect(checkbox).not.toBeChecked();
    await expect(this.page.getByRole("table", { name: "連絡事項" })).toHaveCount(0);
    await this.page.getByText("連絡事項も出力する", { exact: true }).click();
    await expect(checkbox).toBeChecked();
    const table = this.page.getByRole("table", { name: "連絡事項" });
    await expect(table).toBeVisible();
    for (const { dateText, staffName, note } of notes) {
      const row = table.getByRole("row").filter({ hasText: note });
      await expect(row).toContainText(dateText);
      await expect(row).toContainText(staffName);
    }
  }

  async expectHidden() {
    await expect(this.page.getByRole("region", { name: "シフト表プレビュー" })).not.toBeVisible();
    await expect(this.page.getByRole("button", { name: "PDF", exact: true })).not.toBeVisible();
    await expect(this.page.getByRole("button", { name: "Excel", exact: true })).not.toBeVisible();
  }
}
