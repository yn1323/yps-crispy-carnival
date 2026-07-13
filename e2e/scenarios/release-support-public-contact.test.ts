import { test } from "../fixtures/e2eTest";
import { PublicSitePage } from "../pages/PublicSitePage";

const PUBLIC_ROUTES = [
  { path: "/" as const, heading: /シフトのやり取りを\s*LINEやメール\s*でひとつに/ },
  { path: "/features" as const, heading: /シフトリ\s*で、希望回収から確定までひとつに/ },
  { path: "/howto" as const, heading: "使い方・ヘルプ" },
  { path: "/faq" as const, heading: "よくある質問" },
  { path: "/articles" as const, heading: "お役立ちガイド" },
  { path: "/terms" as const, heading: "管理ユーザー向け利用規約" },
  { path: "/terms/staff" as const, heading: "スタッフ向け利用規約" },
  { path: "/privacy" as const, heading: "管理ユーザー向けプライバシーポリシー" },
  { path: "/privacy/staff" as const, heading: "スタッフ向けプライバシーポリシー" },
  { path: "/contact" as const, heading: "お問い合わせ" },
];

test.describe("公開主要ルートのリリースsmoke", { tag: ["@release", "@smoke"] }, () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const publicRoute of PUBLIC_ROUTES) {
    test(`${publicRoute.path} の主要コンテンツが表示される`, async ({ page }) => {
      const publicSite = new PublicSitePage(page);
      await publicSite.goto(publicRoute.path);
      await publicSite.expectHeading(publicRoute.heading);
    });
  }

  test("TOPの主要CTAから新規登録へ進める", async ({ page }) => {
    const publicSite = new PublicSitePage(page);
    await publicSite.goto("/");
    await publicSite.expectPrimaryCtas();
    await publicSite.openSignupFromPrimaryCta();
  });
});
