import { describe, expect, it } from "vitest";
import { validateUserDetailSearch } from "./users.$personId";

describe("ユーザー詳細URL", () => {
  it.each(["information", "notification", "line", "settings"] as const)("tab=%sを表示対象として受け付ける", (tab) => {
    expect(validateUserDetailSearch({ tab })).toEqual({ tab });
  });

  it("tabがない場合は基本情報を表示する", () => {
    expect(validateUserDetailSearch({})).toEqual({ tab: "information" });
  });

  it("不正なtabは基本情報へフォールバックする", () => {
    expect(validateUserDetailSearch({ tab: "unknown" })).toEqual({ tab: "information" });
  });

  it("表示店舗と戻り先の有効値を保持する", () => {
    expect(validateUserDetailSearch({ shop: "shop-b", tab: "line", returnTo: "settings" })).toEqual({
      shop: "shop-b",
      tab: "line",
      returnTo: "settings",
    });
  });
});
