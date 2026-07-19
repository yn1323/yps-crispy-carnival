import { describe, expect, it } from "vitest";
import { validateUserDetailSearch } from "./users.$personId";

describe("ユーザー詳細URL", () => {
  it.each(["notification", "line", "settings"] as const)("tab=%sを表示対象として受け付ける", (tab) => {
    expect(validateUserDetailSearch({ tab })).toEqual({ tab });
  });

  it("tabがない場合は通知タブを表示する", () => {
    expect(validateUserDetailSearch({})).toEqual({ tab: "notification" });
  });

  it("不正なtabは通知タブへフォールバックする", () => {
    expect(validateUserDetailSearch({ tab: "unknown" })).toEqual({ tab: "notification" });
  });

  it("表示店舗と戻り先の有効値を保持する", () => {
    expect(validateUserDetailSearch({ shop: "shop-b", tab: "line", returnTo: "settings", users: "30" })).toEqual({
      shop: "shop-b",
      tab: "line",
      returnTo: "settings",
      users: 30,
    });
  });

  it("不正な一覧表示件数は戻り先へ引き継がない", () => {
    expect(validateUserDetailSearch({ tab: "information", users: "25" })).toEqual({ tab: "notification" });
  });
});
