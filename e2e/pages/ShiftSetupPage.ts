import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const SHIFT_SETUP_DATA_TIMEOUT = 20_000;

/** 店舗ごとの「必要人数設定」ページ。 */
export class ShiftSetupPage {
  constructor(private page: Page) {}

  async goto(organizationId: string, shopId: string) {
    await this.page.goto(
      `/manage/shops/${encodeURIComponent(shopId)}/shift-setup?org=${encodeURIComponent(organizationId)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expectAppHydrated(this.page);
    await expect(this.page.getByRole("heading", { name: "必要人数設定", exact: true })).toBeVisible({
      timeout: SHIFT_SETUP_DATA_TIMEOUT,
    });
  }

  /** ポジションを1つ足してDialogで決定し、ページの「保存する」で保存する。設定ページの一覧に出ることを確認する。 */
  async addPosition(name: string) {
    await this.addPositionDraft(name);
    await this.save();
    await expect(this.positionSection().getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }

  /** ポジションを1つ足してDialogで決定する。Dialogは編集中の一覧へ反映するだけで、まだ保存しない。 */
  async addPositionDraft(name: string) {
    const section = this.positionSection();
    const currentCount = await section.getByRole("listitem").count();
    // ポジションをまだ追加していない店舗では、同じ操作のボタンが「ポジションを追加する」と出る。
    await section.getByRole("button", { name: /^(ポジションを編集する|ポジションを追加する)$/ }).click();

    const dialog = this.page.getByRole("dialog", { name: "ポジションを編集" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "ポジションを追加", exact: true }).click();
    await dialog.getByRole("textbox", { name: `ポジション${currentCount + 1}の名前`, exact: true }).fill(name);
    await dialog.getByRole("button", { name: "決定する", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(section.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }

  /**
   * テンプレートのない店舗で最初のテンプレート「通常」を作り、日付選択の1日の必要人数を入れる。
   * 最初のテンプレートは、すべての営業日に使う。
   */
  async createFirstDateOnlyTemplate(counts: Array<{ positionName: string; count: number }>) {
    await this.page.getByRole("button", { name: "テンプレートを作る", exact: true }).click();
    const template = this.page.getByRole("group", { name: "通常", exact: true });
    await expect(template).toBeVisible();
    for (const { positionName, count } of counts) {
      const input = template.getByRole("spinbutton", { name: `1日の${positionName}の必要人数`, exact: true });
      await input.fill(String(count));
      await expect(input).toHaveValue(String(count));
    }
  }

  /** 「スタッフのスキル」で、初期値（一人前）のマスを1回押して担当外にする。まだ保存しない。 */
  async markStaffPositionUnavailable(staffName: string, positionName: string) {
    await this.page.getByRole("button", { name: `${staffName} ${positionName} 一人前`, exact: true }).click();
    await expect(
      this.page.getByRole("button", { name: `${staffName} ${positionName} 担当外`, exact: true }),
    ).toBeVisible();
  }

  /** ページの「保存する」で、編集中のポジション、テンプレート、スキルをまとめて保存する。 */
  async save() {
    const saveButton = this.page
      .getByRole("group", { name: "変更の保存", exact: true })
      .getByRole("button", { name: "保存する", exact: true });
    await saveButton.click();
    // 保存が終わると、変えた内容によらず同じ知らせが出る。
    await expect(this.page.getByText("シフト設定を保存しました", { exact: true })).toBeVisible({
      timeout: SHIFT_SETUP_DATA_TIMEOUT,
    });
    await expect(saveButton).not.toHaveAttribute("data-loading");
  }

  private positionSection() {
    return this.page.getByRole("region", { name: "ポジション", exact: true });
  }
}
