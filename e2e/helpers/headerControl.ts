import { expect, type Locator } from "@playwright/test";

/** 下へのスクロールで隠れたヘッダー内の操作対象を、ページ先頭へ戻して表示する。 */
export async function revealHeaderControl(target: Locator): Promise<void> {
  await target.page().evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(target).toBeInViewport();
}
