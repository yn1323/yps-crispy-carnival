import { expect, type Locator, type Page } from "@playwright/test";

const SHOP_DETAIL_DATA_TIMEOUT = 20_000;
const CLOSED_DAY_LABELS = {
  sun: "日曜日",
  mon: "月曜日",
  tue: "火曜日",
  wed: "水曜日",
  thu: "木曜日",
  fri: "金曜日",
  sat: "土曜日",
} as const;

type RegularClosedDay = keyof typeof CLOSED_DAY_LABELS;
export type ShopSettingsEdit = {
  shopName?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  submissionPattern?:
    | { kind: "dateOnly" }
    | { kind: "time"; startTime: string; endTime: string }
    | { kind: "shiftType"; options: Array<{ name: string; startTime: string; endTime: string }> };
  regularClosedDays?: RegularClosedDay[];
};

export class ShopDetailPage {
  constructor(private page: Page) {}

  async openFromDashboard() {
    const selectedShopId = new URL(this.page.url()).searchParams.get("shop");

    await this.page.getByRole("button", { name: "店舗詳細を開く" }).click();
    await expect(this.page).toHaveURL(/\/shops\/[^/?]+(?:\?|$)/, {
      timeout: SHOP_DETAIL_DATA_TIMEOUT,
    });
    if (selectedShopId) {
      await expect(this.page).toHaveURL(new RegExp(`/shops/${escapeRegExp(selectedShopId)}(?:\\?|$)`));
    }
    await expect(this.page.getByRole("heading", { name: "店舗詳細", exact: true })).toBeVisible({
      timeout: SHOP_DETAIL_DATA_TIMEOUT,
    });
    await expect(this.page.getByRole("button", { name: /店舗を切り替える。現在は/ })).toHaveCount(0);
  }

  async editSettings(data: ShopSettingsEdit) {
    await this.page.getByRole("button", { name: "編集する" }).click();
    const dialog = this.page.getByRole("dialog", { name: "店舗設定" });
    await expect(dialog).toBeVisible();

    if (data.shopName !== undefined) {
      const nameInput = dialog.getByLabel(/店舗名|お店の名前/);
      await nameInput.clear();
      await nameInput.fill(data.shopName);
    }

    await dialog.getByRole("button", { name: "次へ" }).click();

    const legacyTimePattern =
      data.shiftStartTime !== undefined || data.shiftEndTime !== undefined
        ? {
            kind: "time" as const,
            startTime: data.shiftStartTime ?? "09:00",
            endTime: data.shiftEndTime ?? "22:00",
          }
        : undefined;
    const submissionPattern = data.submissionPattern ?? legacyTimePattern;
    if (submissionPattern) {
      const patternLabel =
        submissionPattern.kind === "dateOnly"
          ? /^日ごと/
          : submissionPattern.kind === "shiftType"
            ? /^勤務区分/
            : /^時間指定/;
      await dialog.getByRole("button", { name: patternLabel }).click();
    }
    await dialog.getByRole("button", { name: "次へ" }).click();

    if (submissionPattern?.kind === "time") {
      await this.selectTimeByIndex("シフト開始時間", submissionPattern.startTime, 0);
      await this.selectTimeByIndex("シフト終了時間", submissionPattern.endTime, 0);
    } else if (submissionPattern?.kind === "shiftType") {
      await this.configureShiftTypeOptions(dialog, submissionPattern.options);
    }

    const nextButton = dialog.getByRole("button", { name: "次へ" });
    if (await nextButton.isVisible()) await nextButton.click();

    if (data.regularClosedDays) await this.setRegularClosedDays(dialog, data.regularClosedDays);

    await dialog.getByRole("button", { name: /保存する|変更を保存/ }).click();
    await this.expectToastVisibleThenHidden("店舗設定を更新しました");
    await expect(dialog).not.toBeVisible();
  }

  async expectTimeRange(timeRange: string) {
    const basicInformation = this.page.getByRole("region", { name: "基本情報" });
    await expect(basicInformation.getByText(timeRange, { exact: true })).toBeVisible();
  }

  async returnToDashboard() {
    await this.page.getByRole("button", { name: "前の画面に戻る" }).click();
    await expect(this.page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: SHOP_DETAIL_DATA_TIMEOUT });
  }

  private async configureShiftTypeOptions(
    dialog: Locator,
    options: Array<{ name: string; startTime: string; endTime: string }>,
  ) {
    while ((await dialog.getByLabel("区分名").count()) < options.length) {
      await dialog.getByRole("button", { name: "勤務区分を追加" }).click();
    }

    for (let index = 0; index < options.length; index++) {
      const option = options[index];
      const nameInput = dialog.getByLabel("区分名").nth(index);
      await nameInput.clear();
      await nameInput.fill(option.name);
      await this.selectTimeByIndex("開始", option.startTime, index);
      await this.selectTimeByIndex("終了", option.endTime, index);
    }
  }

  private async setRegularClosedDays(dialog: Locator, days: RegularClosedDay[]) {
    const daySet = new Set(days);
    for (const [day, label] of Object.entries(CLOSED_DAY_LABELS) as Array<[RegularClosedDay, string]>) {
      const button = dialog.getByRole("button", { name: new RegExp(`^${label}を`) });
      const isPressed = (await button.getAttribute("aria-pressed")) === "true";
      if (daySet.has(day) !== isPressed) await button.click();
    }
  }

  private async selectTimeByIndex(label: string, value: string, index: number) {
    await this.page.getByRole("combobox", { name: label }).nth(index).click();
    await this.page
      .getByRole("listbox", { name: label })
      .getByRole("option", { name: value, exact: true })
      .click({ noWaitAfter: true });
  }

  private async expectToastVisibleThenHidden(title: string) {
    const toast = this.page.locator("[data-scope='toast'][data-part='root']").filter({ hasText: title }).first();
    await expect(toast).toBeVisible();
    await toast.locator("[data-part='close-trigger']").evaluate((element: HTMLElement) => element.click());
    await expect(toast).not.toBeVisible();
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
