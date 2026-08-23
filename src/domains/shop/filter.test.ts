import { describe, expect, it } from "vitest";
import { resolveShopFilter } from "./filter";

const shops = [{ id: "shop-1" }, { id: "shop-2" }];

describe("resolveShopFilter", () => {
  it("店舗候補の読込中はqueryを開始できない状態を返す", () => {
    expect(resolveShopFilter(null, "shop-1")).toEqual({ kind: "loading" });
  });

  it("未指定は組織内の全対象を表示する", () => {
    expect(resolveShopFilter(shops)).toEqual({
      kind: "ready",
      shopFilter: "all",
      shouldReplaceSearch: false,
    });
  });

  it("組織内の店舗だけをfilterとして受け入れる", () => {
    expect(resolveShopFilter(shops, "shop-2")).toEqual({
      kind: "ready",
      shopFilter: "shop-2",
      shouldReplaceSearch: false,
    });
  });

  it("候補外の店舗IDは全対象へfail closedで正規化する", () => {
    expect(resolveShopFilter(shops, "other-shop")).toEqual({
      kind: "ready",
      shopFilter: "all",
      shouldReplaceSearch: true,
    });
  });
});
