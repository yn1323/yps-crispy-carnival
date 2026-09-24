import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const STAFF_SUBMIT_DATA_TIMEOUT = 20_000;

export class StaffSubmitPage {
  constructor(private page: Page) {}

  async goto(token: string) {
    try {
      await this.page.goto(`/shifts/submit?token=${token}`, { waitUntil: "domcontentloaded" });
      await expectAppHydrated(this.page);
      await expect(this.page).toHaveURL(
        (url) => url.pathname === "/shifts/submit" && url.searchParams.get("token") === token,
        { timeout: STAFF_SUBMIT_DATA_TIMEOUT },
      );
      await expect(
        this.submitButton()
          .or(this.page.getByText("提出期限を過ぎたため変更できません", { exact: true }))
          .or(
            this.page.getByRole("heading", {
              name: /このリンクでは提出できません|このシフト募集は削除されました|このシフト募集の提出受付は終了しました/,
            }),
          )
          .first(),
      ).toBeVisible({ timeout: STAFF_SUBMIT_DATA_TIMEOUT });
    } catch {
      throw new Error("E2E capability navigation failed: staff-submit");
    }
  }

  async expectFormVisible() {
    await expect(this.submitButton()).toBeVisible({ timeout: STAFF_SUBMIT_DATA_TIMEOUT });
  }

  async toggleDay(dateText: string) {
    await this.page.getByText(dateText, { exact: true }).locator("..").click();
  }

  async expectSchedule(deadlineText: string, includedDateText: string, excludedDateText: string) {
    await expect(this.page.getByText(`提出期限：${deadlineText} 23:59`, { exact: true })).toBeVisible();
    await expect(this.page.getByText(includedDateText, { exact: true })).toBeVisible();
    await expect(this.page.getByText(excludedDateText, { exact: true })).toHaveCount(0);
  }

  async expectRecruitmentDeleted() {
    await expect(this.page.getByRole("heading", { name: "このシフト募集は削除されました" })).toBeVisible({
      timeout: STAFF_SUBMIT_DATA_TIMEOUT,
    });
    await expect(this.page.getByRole("button", { name: /^希望シフトを(提出|更新)$/ })).toHaveCount(0);
  }

  async expectShiftTypeOptionSelected(dateText: string, optionName: string, selected: boolean) {
    await expect(this.shiftTypeOption(dateText, optionName, selected)).toHaveAttribute(
      "aria-pressed",
      String(selected),
    );
  }

  async toggleShiftTypeOption(dateText: string, optionName: string, currentlySelected: boolean) {
    await this.shiftTypeOption(dateText, optionName, currentlySelected).click();
    await this.expectShiftTypeOptionSelected(dateText, optionName, !currentlySelected);
  }

  async submit() {
    await this.page.getByRole("button", { name: "希望シフトを提出", exact: true }).click();
  }

  async resubmit() {
    await expect(this.page.getByText("提出済み", { exact: true })).toBeVisible();
    await this.page.getByRole("button", { name: "希望シフトを更新", exact: true }).click();
  }

  async expectCompletionVisible() {
    await expect(this.page).toHaveURL((url) => {
      return (
        url.pathname === "/shifts/submit/completed" &&
        Boolean(url.searchParams.get("recruitmentId")) &&
        !url.searchParams.has("shopName")
      );
    });
    await expect(this.page.getByText("提出が完了しました")).toBeVisible();
  }

  async gotoCompletionDirectly() {
    await this.page.goto("/shifts/submit/completed", { waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
  }

  async expectCompletionUnavailable() {
    await expect(this.page).toHaveURL((url) => url.pathname === "/shifts/submit/completed");
    await expect(this.page.getByRole("heading", { name: "提出完了を確認できません" })).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "提出が完了しました" })).toHaveCount(0);
  }

  async expectCompletionPersistsAcrossReloadAndHistory() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await this.expectCompletionVisible();

    await this.page.goBack();
    await expect(this.page).toHaveURL((url) => url.pathname === "/shifts/submit");

    await this.page.goForward();
    await expectAppHydrated(this.page);
    await this.expectCompletionVisible();
  }

  private submitButton() {
    return this.page.getByRole("button", { name: /^希望シフトを(提出|更新)$/ });
  }

  private shiftTypeOption(dateText: string, optionName: string, selected: boolean) {
    return this.page.getByRole("button", {
      name: `${dateText}の${optionName} ${selected ? "選択済み" : "未選択"}`,
      exact: true,
    });
  }
}
