import { test } from "@playwright/test";
import {
	testFullStaffDetailVisible,
	testFullStaffListVisible,
} from "@/e2e/helpers/staff-access-tests";

test.describe("スタッフアクセス制御（owner）", () => {
	test("スタッフ一覧で全ユーザーが表示される", async ({ page }) => {
		await testFullStaffListVisible(page, "owner");
	});

	test("他スタッフの詳細情報が全て表示される", async ({ page }) => {
		await testFullStaffDetailVisible(page, "owner");
	});
});
