import { expect, type Page } from "@playwright/test";
import { expectAppHydrated } from "../helpers/appReadiness";

const SHIFT_SETUP_DATA_TIMEOUT = 20_000;

/** 店舗ごとの「シフト作成の設定」ページ。 */
export class ShiftSetupPage {
  constructor(private page: Page) {}

  async goto(organizationId: string, shopId: string) {
    await this.page.goto(
      `/manage/shops/${encodeURIComponent(shopId)}/shift-setup?org=${encodeURIComponent(organizationId)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expectAppHydrated(this.page);
    await expect(this.page.getByRole("heading", { name: "シフト作成の設定", exact: true })).toBeVisible({
      timeout: SHIFT_SETUP_DATA_TIMEOUT,
    });
  }

  /** ポジションを1つ足してDialogで反映し、ページの「保存する」で保存する。設定ページの一覧に出ることを確認する。 */
  async addPosition(name: string) {
    const section = this.page.getByRole("region", { name: "ポジション", exact: true });
    const currentCount = await section.getByRole("listitem").count();
    await section.getByRole("button", { name: "編集する", exact: true }).click();

    const dialog = this.page.getByRole("dialog", { name: "ポジションを編集" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "ポジションを追加", exact: true }).click();
    await dialog.getByRole("textbox", { name: `ポジション${currentCount + 1}の名前`, exact: true }).fill(name);
    // Dialogは編集中の一覧へ反映するだけで、保存はページの「保存する」で行う。
    await dialog.getByRole("button", { name: "反映する", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(section.getByRole("listitem").filter({ hasText: name })).toBeVisible();

    const saveActions = this.page.getByRole("group", { name: "変更の保存", exact: true });
    await expect(saveActions.getByRole("button", { name: "元に戻す", exact: true })).toBeVisible();
    await saveActions.getByRole("button", { name: "保存する", exact: true }).click();
    // 「元に戻す」は保存の応答を待つ間も残り、保存が終わって保存していない変更がなくなると消える。
    await expect(saveActions.getByRole("button", { name: "元に戻す", exact: true })).toBeHidden({
      timeout: SHIFT_SETUP_DATA_TIMEOUT,
    });
    await expect(saveActions.getByRole("button", { name: "保存する", exact: true })).toBeDisabled();
    await expect(section.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  }
}
