import { expect, type Locator, type Page } from "@playwright/test";

const JAPANESE_WEEKDAYS = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"] as const;
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
type SubmissionPatternEdit =
  | { kind: "dateOnly" }
  | { kind: "time"; startTime: string; endTime: string }
  | {
      kind: "shiftType";
      options: Array<{ name: string; startTime: string; endTime: string }>;
    };

type RecruitmentExpectations = {
  expectedHolidaySummary?: string;
  expectedHolidayDetail?: string;
};

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/dashboard");
  }

  async completeSetup(data: {
    shopName: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    managerName: string;
    managerEmail: string;
  }) {
    await this.page.getByRole("button", { name: /お店を登録する/ }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "初回登録" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/店舗名|お店の名前/).fill(data.shopName);

    const setupTimePattern = data.shiftStartTime !== undefined || data.shiftEndTime !== undefined;
    if (setupTimePattern) {
      await dialog.getByRole("button", { name: /時間指定/ }).click();
    }

    await dialog.getByRole("button", { name: "次へ" }).click();

    if (setupTimePattern) {
      if (data.shiftStartTime !== undefined) {
        await this.selectTime("シフト開始時間", data.shiftStartTime);
      }
      if (data.shiftEndTime !== undefined) {
        await this.selectTime("シフト終了時間", data.shiftEndTime);
      }
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

  async expectLegalReconsentVisible() {
    await expect(this.legalReconsentMessage()).toBeVisible();
  }

  async expectLegalReconsentNotVisible() {
    await expect(this.legalReconsentMessage()).not.toBeVisible();
  }

  async acceptLegalReconsent() {
    await this.page.locator("[data-scope='checkbox'][data-part='control']").click();
    await this.page.getByRole("button", { name: "OK" }).click();
    await expect(this.page.getByText("同意を記録しました")).toBeVisible();
    await this.expectLegalReconsentNotVisible();
  }

  async addStaffs(entries: Array<{ name: string; email: string }>) {
    await this.page.getByRole("button", { name: "スタッフを招待" }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "スタッフを招待" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "スタッフ情報を手入力する" }).click();

    const form = this.page.locator("[id='add-staff-form']");
    const nameInputs = form.getByPlaceholder("例：田中 花子");
    const emailInputs = form.getByPlaceholder("例：hanako@example.com");

    for (let i = 0; i < entries.length; i++) {
      await nameInputs.nth(i).fill(entries[i].name);
      await emailInputs.nth(i).fill(entries[i].email);
    }

    // 余剰行を削除（フォームの初期行数 > 入力数の場合）
    const deleteButtons = dialog.getByRole("button", { name: "削除" });
    while ((await deleteButtons.count()) > entries.length) {
      await deleteButtons.last().click();
    }

    await dialog.getByRole("button", { name: "スタッフを追加する" }).click();
    await expect(this.page.getByText("スタッフを追加しました").first()).toBeVisible();
    await expect(this.page.getByText("スタッフを追加しました").first()).not.toBeVisible();
  }

  async createRecruitment(
    data: { periodStart: string; periodEnd: string; deadline: string },
    expectations: RecruitmentExpectations = {},
  ) {
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
    if (expectations.expectedHolidaySummary) {
      await expect(dialog.getByText("お店のお休み")).toBeVisible();
      await expect(dialog.getByText(expectations.expectedHolidaySummary, { exact: true })).toBeVisible();
    }
    if (expectations.expectedHolidayDetail) {
      await expect(dialog.getByText(expectations.expectedHolidayDetail, { exact: true })).toBeVisible();
    }
    await dialog.getByRole("button", { name: "募集をつくる" }).click();
    await expect(this.page.getByText("募集をつくりました").first()).toBeVisible();
    await expect(this.page.getByText("募集をつくりました").first()).not.toBeVisible();
  }

  async openShiftBoard() {
    await this.recruitmentOpenButton().first().click();
    const warningDialog = this.page.getByRole("alertdialog", { name: "まだ希望がそろっていません" });
    const navigated = this.page.waitForURL(/\/shiftboard\//);
    const dialogAppeared = warningDialog.waitFor({ state: "visible" }).then(() => true);
    // 未提出者がいる募集では確認ダイアログを挟む。提出済みシナリオと未提出シナリオの両方で使うため、
    // URL遷移とdialog表示を競争させて、どちらの導線でも同じPOMから進める。
    if (await Promise.race([dialogAppeared, navigated.then(() => false)])) {
      await warningDialog.getByRole("button", { name: "このまま進む" }).click();
      await navigated;
    }
  }

  async expectStaffSectionVisible() {
    await expect(this.page.getByRole("heading", { name: "スタッフ一覧", exact: true })).toBeVisible();
  }

  async expectStaffVisible(name: string) {
    await expect(this.staffSection().getByText(name)).toBeVisible();
  }

  async editStaff(staffName: string, newData: { name: string; email: string }) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: "編集" }).click();

    const dialog = this.page.getByRole("dialog", { name: "スタッフを編集" });
    await expect(dialog).toBeVisible();
    const form = this.page.locator("[id='edit-staff-form']");
    const nameInput = form.getByPlaceholder("例：田中 花子");
    const emailInput = form.getByPlaceholder("例：hanako@example.com");

    await nameInput.clear();
    await nameInput.fill(newData.name);
    await emailInput.clear();
    await emailInput.fill(newData.email);

    await dialog.getByRole("button", { name: /保存する|変更を保存/ }).click();
    await expect(dialog).not.toBeVisible();
    const toast = this.page.getByText("スタッフ情報を更新しました").first();
    await expect(toast).toBeVisible();
    await expect(toast).not.toBeVisible();
  }

  async deleteStaff(staffName: string) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: "削除" }).click();

    await expect(this.page.getByRole("alertdialog", { name: "スタッフを削除" })).toBeVisible();
    await this.page
      .getByRole("alertdialog")
      .getByRole("button", { name: /削除する|このスタッフを削除/ })
      .click();
    await expect(this.page.getByText("スタッフを削除しました")).toBeVisible();
  }

  async deleteRecruitment() {
    await this.recruitmentSection()
      .getByRole("button", { name: /募集操作メニュー/ })
      .first()
      .click();
    await this.page.getByRole("menuitem", { name: "募集を削除" }).click();

    const dialog = this.page.getByRole("alertdialog", { name: /シフト募集を削除/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("本当に削除してよろしいですか？")).toBeVisible();
    await dialog.getByRole("button", { name: "この募集を削除" }).click();
    await expect(this.page.getByText("シフト募集を削除しました")).toBeVisible();
  }

  async openLineQr(staffName: string) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: /LINE連携QRを表示|LINE連携リンクを表示/ }).click();
    await expect(this.page.getByRole("dialog", { name: /LINE連携QR \/ URL|LINE連携リンク/ })).toBeVisible();
  }

  async sendLineInvite(staffName: string) {
    await this.openStaffMenu(staffName);
    await this.page.getByRole("menuitem", { name: /メールでLINE連携URLを送る|LINE連携リンクをメールで送る/ }).click();

    const dialog = this.page.getByRole("dialog", { name: /メールでLINE連携URLを送る|LINE連携リンクをメールで送る/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "送信" }).click();
    await expect(
      this.page.getByText(/LINE連携URLをメールで送信しました|LINE連携リンクをメールで送信しました/),
    ).toBeVisible();
  }

  async expectStaffNotVisible(name: string) {
    await expect(this.staffSection().getByText(name)).not.toBeVisible();
  }

  async openUserMenu() {
    await this.page.getByRole("button", { name: "ユーザーメニュー" }).click();
  }

  async expectUserMenuInfo(name: string, email: string) {
    await this.openUserMenu();
    const menu = this.page.getByRole("menu");
    await expect(menu.getByText(name)).toBeVisible();
    await expect(menu.getByText(email)).toBeVisible();
    // メニューを閉じる
    await this.page.keyboard.press("Escape");
  }

  async expectRecruitmentCardVisible() {
    await expect(this.recruitmentOpenButton().first()).toBeVisible();
  }

  private recruitmentOpenButton() {
    return this.recruitmentSection().getByRole("button", { name: /希望を見る|シフトを組む|シフトを見る/ });
  }

  async editShopSettings(data: {
    shopName?: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    submissionPattern?: SubmissionPatternEdit;
    regularClosedDays?: RegularClosedDay[];
  }) {
    await this.page.getByRole("button", { name: "店舗設定を編集" }).click({ noWaitAfter: true });
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
          ? "日付のみ"
          : submissionPattern.kind === "shiftType"
            ? "勤務区分から選ぶ"
            : "時間を自由に設定";
      await dialog.getByRole("button", { name: new RegExp(patternLabel) }).click();
    }
    await dialog.getByRole("button", { name: "次へ" }).click();

    if (submissionPattern?.kind === "time") {
      await this.selectTime("シフト開始時間", submissionPattern.startTime);
      await this.selectTime("シフト終了時間", submissionPattern.endTime);
    } else if (submissionPattern?.kind === "shiftType") {
      await this.configureShiftTypeOptions(dialog, submissionPattern.options);
    }

    await dialog.getByRole("button", { name: "次へ" }).click();

    if (data.regularClosedDays) {
      await this.setRegularClosedDays(dialog, data.regularClosedDays);
    }

    await dialog.getByRole("button", { name: /保存する|変更を保存/ }).click();
    await expect(this.page.getByText("店舗設定を更新しました")).toBeVisible();
  }

  async expectShopName(name: string) {
    await expect(this.page.getByText(name)).toBeVisible();
  }

  async expectShopTimeRange(timeRange: string) {
    const [startTime, endTime] = timeRange.split("〜");
    if (!startTime || !endTime) throw new Error(`Invalid time range: ${timeRange}`);

    await this.page.getByRole("button", { name: "店舗設定を編集" }).click({ noWaitAfter: true });
    const dialog = this.page.getByRole("dialog", { name: "店舗設定" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "次へ" }).click();
    await dialog.getByRole("button", { name: "次へ" }).click();

    await expect(dialog.getByRole("combobox", { name: "シフト開始時間" })).toContainText(startTime);
    await expect(dialog.getByRole("combobox", { name: "シフト終了時間" })).toContainText(endTime);

    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(dialog).not.toBeVisible();
  }

  // ページネーション関連
  async clickLoadMoreRecruitments() {
    await this.recruitmentSection().getByRole("button", { name: "もっと見る" }).click();
  }

  async clickShowAllStaffs() {
    await this.staffSection().getByRole("button", { name: "もっと見る" }).click();
  }

  async expectRecruitmentCardCount(count: number) {
    await expect(this.recruitmentOpenButton()).toHaveCount(count);
  }

  async expectStaffRowCount(count: number) {
    await expect(this.staffSection().getByRole("button", { name: "スタッフの操作メニュー" })).toHaveCount(count);
  }

  async expectLoadMoreRecruitmentVisible() {
    await expect(this.recruitmentSection().getByRole("button", { name: "もっと見る" })).toBeVisible();
  }

  async expectLoadMoreRecruitmentNotVisible() {
    await expect(this.recruitmentSection().getByRole("button", { name: "もっと見る" })).not.toBeVisible();
  }

  async expectShowAllStaffsVisible() {
    await expect(this.staffSection().getByRole("button", { name: "もっと見る" })).toBeVisible();
  }

  async expectShowAllStaffsNotVisible() {
    await expect(this.staffSection().getByRole("button", { name: "もっと見る" })).not.toBeVisible();
  }

  private recruitmentSection() {
    return this.page.getByRole("region", { name: "シフト募集" });
  }

  private staffSection() {
    return this.page.getByRole("region", { name: "スタッフ一覧" });
  }

  private legalReconsentMessage() {
    return this.page.getByText("利用規約・プライバシーポリシーを更新しました");
  }

  private async openStaffMenu(staffName: string) {
    const row = this.staffSection().getByRole("article", { name: `${staffName}のスタッフ情報` });
    await row.getByRole("button", { name: "スタッフの操作メニュー" }).click({ noWaitAfter: true });
  }

  // 同名オプションが複数Select間で重複するため、listbox にスコープして選択
  private async selectTime(label: string, value: string) {
    await this.selectTimeByIndex(label, value, 0);
  }

  private async selectTimeByIndex(label: string, value: string, index: number) {
    // Chakra Select は同じ時刻 option が複数のlistboxに出るため、開いたcomboboxのラベルでスコープする。
    await this.page.getByRole("combobox", { name: label }).nth(index).click();
    await this.page
      .getByRole("listbox", { name: label })
      .getByRole("option", { name: value, exact: true })
      .click({ noWaitAfter: true });
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
      if (daySet.has(day) !== isPressed) {
        await button.click();
      }
    }
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
  const weekday = JAPANESE_WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${year}年${month}月${day}日${weekday}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
