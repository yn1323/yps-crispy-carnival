import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { resolveActionShopFilter } from ".";

const shops = [
  { id: "shop-1", name: "yn1323店舗" },
  { id: "shop-2", name: "もて" },
];

describe("resolveActionShopFilter", () => {
  it("店舗候補の読込中はqueryを開始しない", () => {
    expect(resolveActionShopFilter(null, "shop-1")).toEqual({ kind: "loading" });
  });

  it("未指定は組織内の全対象を表示する", () => {
    expect(resolveActionShopFilter(shops)).toEqual({
      kind: "ready",
      shopFilter: "all",
      shouldReplaceSearch: false,
    });
  });

  it("組織内の店舗だけをfilterとして受け入れる", () => {
    expect(resolveActionShopFilter(shops, "shop-2")).toEqual({
      kind: "ready",
      shopFilter: "shop-2" as Id<"shops">,
      shouldReplaceSearch: false,
    });
  });

  it("候補外の店舗IDは全対象へfail closedで正規化する", () => {
    expect(resolveActionShopFilter(shops, "other-shop")).toEqual({
      kind: "ready",
      shopFilter: "all",
      shouldReplaceSearch: true,
    });
  });
});
