import { expect, type Locator, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const APP_SHIFTS_DATA_TIMEOUT = 20_000;
const JAPANESE_WEEKDAYS = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"] as const;
const RECRUITMENT_CREATED_TOAST_TITLE = "シフト提出依頼をスタッフに送りました";

type RecruitmentInput = {
  periodStart: string;
  periodEnd: string;
  deadline: string;
  shopName: string;
};

export class AppShiftsPage {
  private activeOrganizationId: string | null = null;

  constructor(private page: Page) {}

  async goto(organizationId?: string) {
    const search = organizationId ? `?org=${encodeURIComponent(organizationId)}` : "";
    await this.page.goto(`/shifts${search}`, { waitUntil: "domcontentloaded" });
    await expectAppHydrated(this.page);
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/shifts" &&
        Boolean(url.searchParams.get("org")) &&
        (!organizationId || url.searchParams.get("org") === organizationId) &&
        url.searchParams.get("shopFilter") === null,
      { timeout: APP_SHIFTS_DATA_TIMEOUT },
    );
    await expect(this.page.getByRole("heading", { name: "シフト", exact: true })).toBeVisible({
      timeout: APP_SHIFTS_DATA_TIMEOUT,
    });

    const resolvedOrganizationId = new URL(this.page.url()).searchParams.get("org");
    if (!resolvedOrganizationId) throw new Error("Canonical organization ID was not reflected in the shifts URL");
    this.activeOrganizationId = resolvedOrganizationId;
    return resolvedOrganizationId;
  }

  async expectDefaultAllFilter() {
    await expect(this.page).toHaveURL((url) => url.searchParams.get("shopFilter") === null, {
      timeout: APP_SHIFTS_DATA_TIMEOUT,
    });
  }

  async selectShopFilter(shopName: string, shopId: string) {
    if (!this.activeOrganizationId) throw new Error("Open the shifts page before selecting a shop filter");
    await this.shopFilterTrigger("すべて").click();
    await this.page.getByRole("menuitemradio", { name: shopName, exact: true }).click();
    await expect(this.page).toHaveURL(
      (url) =>
        url.pathname === "/shifts" &&
        url.searchParams.get("org") === this.activeOrganizationId &&
        url.searchParams.get("shopFilter") === shopId,
      { timeout: APP_SHIFTS_DATA_TIMEOUT },
    );
    await expect(this.shopFilterTrigger(shopName)).toBeVisible({ timeout: APP_SHIFTS_DATA_TIMEOUT });
  }

  async createRecruitment(data: RecruitmentInput) {
    await this.page.getByRole("button", { name: "新しい募集をつくる" }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "新しい募集をつくる" });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText("対象店舗を選択", { exact: true })).toBeVisible();
    const shopOption = dialog.getByRole("radio", { name: `${data.shopName}を選択`, exact: true });
    await expect(shopOption).not.toBeChecked();
    await dialog.getByText(data.shopName, { exact: true }).click();
    await expect(shopOption).toBeChecked();
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("シフト期間を選択", { exact: true })).toBeVisible();
    await this.selectCalendarDate(dialog, data.periodStart);
    await this.selectCalendarDate(dialog, data.periodEnd);
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("定休日を選択(任意)", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("提出期限を選択", { exact: true })).toBeVisible();
    await this.selectCalendarDate(dialog, data.deadline);
    await dialog.getByRole("button", { name: "確認へ" }).click();

    await expect(dialog.getByText("内容を確認", { exact: true })).toBeVisible();
    const targetShopSummary = dialog.getByText("対象店舗", { exact: true }).locator("..");
    await expect(targetShopSummary).toContainText(data.shopName);
    await dialog.getByRole("button", { name: "募集をつくる" }).click();
    await this.expectToastVisibleThenHidden(RECRUITMENT_CREATED_TOAST_TITLE);
    await this.expectRecruitmentVisible(data);
  }

  /** Dashboardなど、対象店舗が決まった画面から募集を作る。 */
  async createRecruitmentForCurrentShop(data: Omit<RecruitmentInput, "shopName">) {
    await this.page.getByRole("button", { name: "新しい募集をつくる" }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "新しい募集をつくる" });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText("シフト期間を選択", { exact: true })).toBeVisible();
    await this.selectCalendarDate(dialog, data.periodStart);
    await this.selectCalendarDate(dialog, data.periodEnd);
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("定休日を選択(任意)", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("提出期限を選択", { exact: true })).toBeVisible();
    await this.selectCalendarDate(dialog, data.deadline);
    await dialog.getByRole("button", { name: "確認へ" }).click();

    await expect(dialog.getByText("内容を確認", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "募集をつくる" }).click();
    await this.expectToastVisibleThenHidden(RECRUITMENT_CREATED_TOAST_TITLE);
  }

  async openRecruitmentCardByPeriod(data: Pick<RecruitmentInput, "periodStart" | "periodEnd">) {
    const periodLabel = `${formatDateShort(data.periodStart)} 〜 ${formatDateShort(data.periodEnd)}`;
    await this.page.getByRole("button", { name: new RegExp(`${escapeRegExp(periodLabel)}のシフトを見る$`) }).click();
    await expect(this.page).toHaveURL((url) => /^\/shifts\/[^/]+\/board$/.test(url.pathname), {
      timeout: APP_SHIFTS_DATA_TIMEOUT,
    });
  }

  async expectRecruitmentVisible(data: Pick<RecruitmentInput, "periodStart" | "periodEnd" | "shopName">) {
    const row = this.recruitmentRow(data);
    await expect(row).toBeVisible({ timeout: APP_SHIFTS_DATA_TIMEOUT });
    await expect(row).toContainText(data.shopName);
  }

  async expectSubmissionCount(
    data: Pick<RecruitmentInput, "periodStart" | "periodEnd" | "shopName">,
    responseCount: number,
    totalStaffCount: number,
  ) {
    await expect(
      this.recruitmentRow(data).getByText(`提出 ${responseCount}/${totalStaffCount}人`, { exact: true }),
    ).toBeVisible({ timeout: APP_SHIFTS_DATA_TIMEOUT });
  }

  async editRecruitmentSchedule(
    data: Pick<RecruitmentInput, "periodStart" | "periodEnd" | "shopName">,
    next: Omit<RecruitmentInput, "shopName">,
  ) {
    await this.openRecruitmentMenu(data);
    await this.page.getByRole("menuitem", { name: "募集を編集", exact: true }).click();
    const dialog = this.page.getByRole("dialog", { name: "シフト募集を編集" });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText("シフト期間を選択", { exact: true })).toBeVisible();
    await this.selectCalendarDate(dialog, next.periodStart);
    await this.selectCalendarDate(dialog, next.periodEnd);
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("定休日を選択(任意)", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByText("提出期限を選択", { exact: true })).toBeVisible();
    await this.selectCalendarDate(dialog, next.deadline);
    await dialog.getByRole("button", { name: "確認へ" }).click();

    await expect(dialog.getByText("内容を確認", { exact: true })).toBeVisible();
    await expect(dialog.getByText("変更後", { exact: true }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "変更を保存", exact: true }).click();
    await this.expectToastVisibleThenHidden("シフト募集を変更しました");
    await this.expectRecruitmentVisible({ ...next, shopName: data.shopName });
  }

  async deleteRecruitment(data: Pick<RecruitmentInput, "periodStart" | "periodEnd" | "shopName">) {
    await this.openRecruitmentMenu(data);
    await this.page.getByRole("menuitem", { name: "募集を削除", exact: true }).click();
    const dialog = this.page.getByRole("alertdialog", {
      name: `${formatDateShort(data.periodStart)}〜${formatDateShort(data.periodEnd)}のシフト募集を削除`,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "この募集を削除", exact: true }).click();
    await this.expectToastVisibleThenHidden("シフト募集を削除しました");
    await this.expectRecruitmentAbsent(data);
  }

  async expectRecruitmentAbsent(data: Pick<RecruitmentInput, "periodStart" | "periodEnd" | "shopName">) {
    await expect(this.recruitmentRow(data)).toHaveCount(0, { timeout: APP_SHIFTS_DATA_TIMEOUT });
  }

  async openRecruitment(data: Pick<RecruitmentInput, "periodStart" | "periodEnd" | "shopName">) {
    if (!this.activeOrganizationId) throw new Error("Open the shifts page before selecting a recruitment");
    const row = this.recruitmentRow(data);
    await expect(row).toBeVisible({ timeout: APP_SHIFTS_DATA_TIMEOUT });

    await row.click();

    await expect(this.page).toHaveURL(
      (url) =>
        /^\/shifts\/[^/]+\/board$/.test(url.pathname) &&
        url.searchParams.get("org") === this.activeOrganizationId &&
        url.searchParams.get("shopFilter") === null,
      { timeout: APP_SHIFTS_DATA_TIMEOUT },
    );

    const periodLabel = `${formatDateShort(data.periodStart)} 〜 ${formatDateShort(data.periodEnd)}`;
    await expect(
      this.page.getByRole("heading", { level: 1, name: `${data.shopName}：${periodLabel}`, exact: true }),
    ).toBeVisible({ timeout: APP_SHIFTS_DATA_TIMEOUT });
  }

  private shopFilterTrigger(currentLabel: string) {
    return this.page.getByRole("button", {
      name: `店舗で絞り込む（現在：${currentLabel}）`,
      exact: true,
    });
  }

  private async openRecruitmentMenu(data: Pick<RecruitmentInput, "periodStart" | "periodEnd" | "shopName">) {
    const periodLabel = `${formatDateShort(data.periodStart)} 〜 ${formatDateShort(data.periodEnd)}`;
    await this.page
      .getByRole("region", { name: "シフト一覧", exact: true })
      .getByRole("button", { name: `${data.shopName}の${periodLabel}の募集操作メニュー`, exact: true })
      .click();
  }

  private recruitmentRow(data: Pick<RecruitmentInput, "periodStart" | "periodEnd" | "shopName">) {
    const periodLabel = `${formatDateShort(data.periodStart)} 〜 ${formatDateShort(data.periodEnd)}`;
    return this.page
      .getByRole("region", { name: "シフト一覧", exact: true })
      .getByRole("button", { name: `${data.shopName}の${periodLabel}のシフトを見る`, exact: true });
  }

  private async expectToastVisibleThenHidden(title: string | RegExp) {
    const toast = this.page.locator("[data-scope='toast'][data-part='root']").filter({ hasText: title }).first();
    await expect(toast).toBeVisible();
    await toast.locator("[data-part='close-trigger']").evaluate((element: HTMLElement) => element.click());
    await expect(
      this.page.locator("[data-scope='toast'][data-part='root'][data-state='open']").filter({ hasText: title }),
    ).toHaveCount(0);
  }

  private async selectCalendarDate(scope: Locator, date: string) {
    const button = scope.getByRole("button", {
      // 編集時は選択済みの日付が「Starting range from」などの接頭辞で読み上げられる。
      name: new RegExp(
        `^(Choose|Starting range from|Range ending at|Selected date\\.) ${escapeRegExp(formatCalendarAriaDate(date))}$`,
      ),
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

function formatDateShort(date: string) {
  const [, month, day] = date.split("-").map(Number);
  return `${month}/${day}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
