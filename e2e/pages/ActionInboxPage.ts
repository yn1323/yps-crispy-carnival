import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const ACTION_INBOX_DATA_TIMEOUT = 20_000;

/** Dashboardの「要対応」と`/actions`が共有する要対応カードの操作。 */
export class ActionInboxPage {
  constructor(private page: Page) {}

  async gotoActions(organizationId: string) {
    await this.page.goto(`/actions?org=${encodeURIComponent(organizationId)}`, { waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await expect(this.page.getByRole("heading", { level: 1, name: "要対応", exact: true })).toBeVisible({
      timeout: ACTION_INBOX_DATA_TIMEOUT,
    });
  }

  async expectActionsEmpty() {
    await expect(this.page.getByText("対応が必要な項目はありません", { exact: true })).toBeVisible({
      timeout: ACTION_INBOX_DATA_TIMEOUT,
    });
  }

  /** Dashboardの要対応で、件数付きの見出しを開く。 */
  async openDashboardTask(title: string) {
    const trigger = this.page.getByRole("button", { name: title, exact: true });
    await expect(trigger).toBeVisible({ timeout: ACTION_INBOX_DATA_TIMEOUT });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  }

  async expectDashboardTaskAbsent(titlePattern: RegExp) {
    await expect(this.page.getByRole("button", { name: titlePattern })).toHaveCount(0, {
      timeout: ACTION_INBOX_DATA_TIMEOUT,
    });
  }

  async runPrimaryAction(subject: string, actionLabel: string) {
    const card = this.card(subject);
    await expect(card).toBeVisible({ timeout: ACTION_INBOX_DATA_TIMEOUT });
    await card.getByRole("button", { name: actionLabel, exact: true }).click();
    await expect(card).toHaveCount(0, { timeout: ACTION_INBOX_DATA_TIMEOUT });
  }

  async dismissNotificationFailure(staffName: string) {
    const card = this.card(staffName);
    await expect(card).toBeVisible({ timeout: ACTION_INBOX_DATA_TIMEOUT });
    await card.getByRole("button", { name: /のその他の操作$/ }).click();
    await this.page.getByRole("menuitem", { name: "再送せず破棄する", exact: true }).click();
    const dialog = this.page.getByRole("alertdialog", { name: "送れなかった通知を破棄しますか？" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "破棄する", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveCount(0, { timeout: ACTION_INBOX_DATA_TIMEOUT });
  }

  async expectCardAbsent(subject: string) {
    await expect(this.card(subject)).toHaveCount(0);
  }

  private card(subject: string) {
    return this.page.getByRole("article").filter({ hasText: subject });
  }
}
