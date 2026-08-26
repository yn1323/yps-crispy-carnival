import { describe, expect, it } from "vitest";
import type { ShopContextOption } from "@/src/domains/shop/context";
import { buildManagerInvitationRedirect, findAcceptedShopContext, formatManagerInvitationExpiry } from "./script";

const shop = (overrides: Partial<ShopContextOption> = {}): ShopContextOption => ({
  shopId: "shop-a",
  shopName: "渋谷店",
  shopStatus: "active",
  organizationId: "organization-a",
  organizationName: "さくらダイニング",
  organizationPlan: "pro",
  ...overrides,
});

describe("manager invitation helpers", () => {
  it("招待tokenをquery値としてencodeして認証後の戻り先を作る", () => {
    expect(buildManagerInvitationRedirect("token&redirect=https://evil.example")).toBe(
      "/manager-invite?token=token%26redirect%3Dhttps%3A%2F%2Fevil.example",
    );
  });

  it("有効期限をJSTで表示する", () => {
    expect(formatManagerInvitationExpiry(Date.UTC(2026, 6, 23, 9, 5))).toBe("2026年7月23日 18:05");
  });

  it("承認結果と同じ事業者・店舗を返す", () => {
    const shops = [
      shop({ organizationId: "organization-b" }),
      shop({ shopStatus: "archived" }),
      shop({ shopId: "shop-b" }),
    ];

    expect(findAcceptedShopContext(shops, { organizationId: "organization-a", shopId: "shop-a" })).toEqual(shops[1]);
    expect(findAcceptedShopContext(shops, { organizationId: "organization-a", shopId: "shop-b" })).toEqual(shops[2]);
  });
});
