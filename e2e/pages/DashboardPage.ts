import { expect, type Locator, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";
import { assertNotificationRecipientSuppressed } from "../helpers/notificationProbe";

const JAPANESE_WEEKDAYS = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"] as const;
const DASHBOARD_DATA_TIMEOUT = 20_000;
const SHOP_SWITCHER_BUTTON_NAME = /^店舗を切り替える/;
const SHIFT_BOARD_OPEN_BUTTON_NAME = /回収状況を見る|シフトを組む|シフトを見る/;
const RECRUITMENT_CREATED_TOAST_TITLE = /募集をつくりました|募集をつくり、スタッフに通知しました/;

export class DashboardPage {
  constructor(private page: Page) {}

  async goto(shopId?: string) {
    await this.page.goto(shopId ? `/dashboard?shop=${encodeURIComponent(shopId)}` : "/dashboard", {
      waitUntil: "domcontentloaded",
    });
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) => url.pathname === "/dashboard" && (!shopId || url.searchParams.get("shop") === shopId),
      { timeout: DASHBOARD_DATA_TIMEOUT },
    );
    await this.expectDashboardReady();
  }

  async completeSetup(data: {
    shopName: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    managerName: string;
    managerEmail: string;
  }) {
    assertNotificationRecipientSuppressed(data.managerEmail);
    await this.page.getByRole("button", { name: /お店を登録する/ }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "初回登録" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/店舗名|お店の名前/).fill(data.shopName);

    const usesTimeRange = data.shiftStartTime !== undefined || data.shiftEndTime !== undefined;
    if (usesTimeRange) {
      const timePatternButton = dialog.getByRole("button", { name: /時間指定|時間を自由に設定/ });
      await expect(timePatternButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
      await timePatternButton.click();
    }

    await dialog.getByRole("button", { name: "次へ" }).click();
    if (usesTimeRange) {
      if (data.shiftStartTime !== undefined) await this.selectTime("シフト開始時間", data.shiftStartTime);
      if (data.shiftEndTime !== undefined) await this.selectTime("シフト終了時間", data.shiftEndTime);
      await dialog.getByRole("button", { name: "次へ" }).click();
    }

    await expect(dialog.getByLabel("あなたの名前")).toBeVisible();
    await dialog.getByLabel("あなたの名前").fill(data.managerName);
    await dialog.getByLabel("メールアドレス").fill(data.managerEmail);
    await dialog.locator("[data-scope='checkbox'][data-part='control']").click();
    await dialog.getByRole("button", { name: "お店を登録する" }).click();
  }

  async expectSetupComplete() {
    await expect(this.page.getByText("セットアップが完了しました")).toBeVisible();
  }

  async expectShopAvailable(shopName: string) {
    await expect(this.page).toHaveURL((url) => url.pathname === "/dashboard", { timeout: DASHBOARD_DATA_TIMEOUT });
    await expect(this.page.getByRole("heading", { name: shopName, exact: true })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
    await expect(this.page.getByRole("button", { name: "新しい募集をつくる" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
  }

  async createRecruitment(data: { periodStart: string; periodEnd: string; deadline: string }) {
    await this.page.getByRole("button", { name: "新しい募集をつくる" }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "新しい募集をつくる" });
    await expect(dialog).toBeVisible();

    await this.selectCalendarDate(dialog, data.periodStart);
    await this.selectCalendarDate(dialog, data.periodEnd);
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("お店のお休みを選択")).toBeVisible();
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("提出締切日を選択")).toBeVisible();
    await this.selectCalendarDate(dialog, data.deadline);
    await dialog.getByRole("button", { name: "確認へ" }).click();

    await expect(dialog.getByText("内容を確認", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "募集をつくる" }).click();
    await this.expectToastVisibleThenHidden(RECRUITMENT_CREATED_TOAST_TITLE);
  }

  async openShiftBoard() {
    const openButton = this.recruitmentOpenButton();
    await expect(openButton).toHaveCount(1, { timeout: DASHBOARD_DATA_TIMEOUT });
    await expect(openButton).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });

    const continueButton = this.page
      .getByRole("alertdialog", { name: "まだ希望がそろっていません" })
      .getByRole("button", { name: "このまま進む" });
    const shiftBoardReady = this.page.getByRole("link", { name: "戻る", exact: true });
    await openButton.click();
    await expect(continueButton.or(shiftBoardReady).first()).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
    if (await continueButton.isVisible()) await continueButton.click();
    await expect(this.page).toHaveURL(/\/shiftboard\//, { timeout: DASHBOARD_DATA_TIMEOUT });
  }

  async expectStaffVisible(name: string) {
    await this.expectDashboardDataLoaded();
    await expect(this.staffSection().getByText(name)).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  async expectStaffNotVisible(name: string) {
    await this.expectDashboardDataLoaded();
    await expect(this.staffSection().getByText(name)).not.toBeVisible();
  }

  async expectSelectedShop(shopName: string, shopId: string) {
    await expect(this.page).toHaveURL(new RegExp(`/dashboard\\?shop=${escapeRegExp(shopId)}(?:&|$)`));
    await expect(this.page.getByRole("heading", { name: shopName, exact: true })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
  }

  async switchShop(shopName: string, expectedShopId: string) {
    await this.page.getByRole("button", { name: SHOP_SWITCHER_BUTTON_NAME }).click();
    await this.page.getByRole("menuitem").filter({ hasText: shopName }).click();
    await this.expectSelectedShop(shopName, expectedShopId);
  }

  async switchShopAndReadId(shopName: string) {
    const currentShopId = new URL(this.page.url()).searchParams.get("shop");
    await this.page.getByRole("button", { name: SHOP_SWITCHER_BUTTON_NAME }).click();
    await this.page.getByRole("menuitem").filter({ hasText: shopName }).click();
    await expect(this.page).toHaveURL(
      (url) => {
        const shopId = url.searchParams.get("shop");
        return url.pathname === "/dashboard" && shopId !== null && shopId !== currentShopId;
      },
      { timeout: DASHBOARD_DATA_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: shopName, exact: true })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
    const shopId = new URL(this.page.url()).searchParams.get("shop");
    if (!shopId) throw new Error("Selected shop ID was not reflected in the Dashboard URL");
    return shopId;
  }

  async openCurrentShopDetail(shopId: string) {
    await this.page.getByRole("button", { name: "店舗詳細を開く" }).click();
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === `/shops/${shopId}` &&
        url.searchParams.get("shop") === shopId &&
        url.searchParams.get("returnTo") === "dashboard",
      { timeout: DASHBOARD_DATA_TIMEOUT },
    );
  }

  async expectSingleShopContext(shopName: string, shopId: string) {
    await this.expectSelectedShop(shopName, shopId);
    await expect(this.page.getByRole("button", { name: SHOP_SWITCHER_BUTTON_NAME })).toHaveCount(0);
    await expect(this.page.getByRole("button", { name: "新しい募集をつくる" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
  }

  private async expectDashboardReady() {
    const readyState = this.page
      .getByRole("button", { name: "新しい募集をつくる" })
      .or(this.page.getByRole("button", { name: /お店を登録する/ }))
      .or(this.page.getByRole("heading", { name: "この店舗を開けません" }))
      .first();
    await expect(readyState).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  private async expectDashboardDataLoaded() {
    await expect(this.page.getByRole("button", { name: "新しい募集をつくる" })).toBeVisible({
      timeout: DASHBOARD_DATA_TIMEOUT,
    });
    await expect(this.staffSection()).toBeVisible({ timeout: DASHBOARD_DATA_TIMEOUT });
  }

  private recruitmentOpenButton() {
    return this.page
      .getByRole("region", { name: "シフト一覧" })
      .getByRole("button", { name: SHIFT_BOARD_OPEN_BUTTON_NAME });
  }

  private staffSection() {
    return this.page.getByRole("region", { name: "スタッフ一覧" });
  }

  private async expectToastVisibleThenHidden(title: string | RegExp) {
    const toast = this.page.locator("[data-scope='toast'][data-part='root']").filter({ hasText: title }).first();
    await expect(toast).toBeVisible();
    await toast.locator("[data-part='close-trigger']").evaluate((element: HTMLElement) => element.click());
    await expect(
      this.page.locator("[data-scope='toast'][data-part='root'][data-state='open']").filter({ hasText: title }),
    ).toHaveCount(0);
  }

  private async selectTime(label: string, value: string) {
    await this.page.getByRole("combobox", { name: label }).click();
    await this.page
      .getByRole("listbox", { name: label })
      .getByRole("option", { name: value, exact: true })
      .click({ noWaitAfter: true });
  }

  private async selectCalendarDate(scope: Locator, date: string) {
    const button = scope.getByRole("button", {
      name: new RegExp(`^Choose ${escapeRegExp(formatCalendarAriaDate(date))}$`),
    });
    await expect(button).toBeVisible();
    await button.click();
  }
}

function formatCalendarAriaDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = JAPANESE_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${year}年${month}月${day}日${weekday}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
