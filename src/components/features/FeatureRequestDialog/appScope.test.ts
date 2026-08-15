import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { type AppFeatureRequestScope, resolveAppFeatureRequestShopId } from "./appScope";

const SHOP_A = "shops_a" as Id<"shops">;

describe("app feature request scope", () => {
  it("店舗固定画面は固定店舗を内部送信先に使う", () => {
    const scope = { kind: "shop", shop: { id: SHOP_A, name: "A店舗" } } satisfies AppFeatureRequestScope;

    expect(resolveAppFeatureRequestShopId(scope)).toBe(SHOP_A);
  });

  it("組織画面は店舗IDを付けない", () => {
    const scope = { kind: "organization" } satisfies AppFeatureRequestScope;

    expect(resolveAppFeatureRequestShopId(scope)).toBeUndefined();
  });
});
