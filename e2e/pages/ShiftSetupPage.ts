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
    const section = this.page.getByRole("region", { name: "ポジション", exact: true });
    const currentCount = await section.getByRole("listitem").count();
    // ポジションをまだ追加していない店舗では、同じ操作のボタンが「ポジションを追加する」と出る。
    await section.getByRole("button", { name: /^(ポジションを編集する|ポジションを追加する)$/ }).click();

    const dialog = this.page.getByRole("dialog", { name: "ポジションを編集" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "ポジションを追加", exact: true }).click();
    await dialog.getByRole("textbox", { name: `ポジション${currentCount + 1}の名前`, exact: true }).fill(name);
    // Dialogは編集中の一覧へ反映するだけで、保存はページの「保存する」で行う。
    await dialog.getByRole("button", { name: "決定する", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(section.getByRole("listitem").filter({ hasText: name })).toBeVisible();

    const saveButton = this.page
      .getByRole("group", { name: "変更の保存", exact: true })
      .getByRole("button", { name: "保存する", exact: true });
    await saveButton.click();
    // 保存が終わると、変えた内容によらず同じ知らせが出る。
    await expect(this.page.getByText("シフト設定を保存しました", { exact: true })).toBeVisible({
      timeout: SHIFT_SETUP_DATA_TIMEOUT,
    });
    await expect(saveButton).not.toHaveAttribute("data-loading");
    await expect(section.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }
}
