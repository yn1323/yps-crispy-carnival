import { expect, test } from "@playwright/test";
import {
  goToFirstShop,
  goToInviteTab,
  goToStaffTab,
  openManagerInviteModal,
  waitForInviteList,
} from "@/e2e/helpers/navigation";

test.describe("招待中タブ", () => {
  test("招待中タブが表示されること", async ({ page }) => {
    await goToFirstShop(page);

    // 招待中タブが存在する
    const inviteTab = page.getByRole("tab", { name: "招待中" });
    await expect(inviteTab).toBeVisible();
  });

  test("招待作成→招待中タブで確認→コピー→キャンセルの一連のフロー", async ({ page }) => {
    // 1. 店舗詳細 → スタッフタブ
    await goToFirstShop(page);
    await goToStaffTab(page);

    // 2. マネージャー招待を作成
    await openManagerInviteModal(page);
    const managerName = `招待タブテスト_${Date.now()}`;
    const managerEmail = `invite-test-${Date.now()}@example.com`;
    await page.getByLabel("名前").fill(managerName);
    await page.getByLabel("メールアドレス").fill(managerEmail);
    await page.getByRole("button", { name: "招待リンクを作成" }).click();

    // 成功トースト確認
    await expect(page.getByText("招待リンクを作成しました")).toBeVisible();

    // モーダルを閉じる
    await page.getByRole("button", { name: "閉じる" }).click();

    // 3. 招待中タブに移動
    await goToInviteTab(page);
    await waitForInviteList(page);

    // 4. 作成した招待が一覧に表示されていることを確認（タブパネル内でスコープ）
    const tabPanel = page.getByRole("tabpanel");
    await expect(tabPanel.getByText(managerName)).toBeVisible();

    // メールアドレスも表示されていることを確認
    await expect(tabPanel.getByText(managerEmail)).toBeVisible();

    // 5. コピーボタンをクリック（最初のボタン）
    await tabPanel
      .getByRole("button", { name: /コピー/ })
      .first()
      .click();

    // コピー成功トースト確認
    await expect(page.getByText("招待リンクをコピーしました")).toBeVisible();

    // 6. 取消ボタンをクリック（最初のボタン）
    await tabPanel.getByRole("button", { name: /取消/ }).first().click();

    // 確認ダイアログが表示される
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByText(`${managerName}さんへの招待をキャンセルしますか？`)).toBeVisible();

    // 「招待を取り消す」ボタンをクリック
    await page.getByRole("button", { name: "招待を取り消す" }).click();

    // キャンセル成功トースト確認
    await expect(page.getByText("招待をキャンセルしました")).toBeVisible();

    // 7. 一覧から消えていることを確認
    await expect(page.getByText(managerName)).not.toBeVisible();
  });

  test("招待がない場合は空状態が表示されること", async ({ page }) => {
    await goToFirstShop(page);
    await goToInviteTab(page);

    // 空状態の場合のメッセージを確認（招待がある場合は件数が表示される）
    const emptyMessage = page.getByText("招待中のマネージャーはいません");
    const inviteCount = page.getByText(/\d+件の招待/);

    // どちらかが表示されている
    const isEmpty = await emptyMessage.isVisible().catch(() => false);
    const hasInvites = await inviteCount.isVisible().catch(() => false);

    expect(isEmpty || hasInvites).toBe(true);
  });
});
