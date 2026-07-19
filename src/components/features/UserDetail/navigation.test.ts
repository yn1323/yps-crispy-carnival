import { describe, expect, it } from "vitest";
import { getUserDetailBackDestination, mergeUserDetailSearch } from "./navigation";

describe("ユーザー詳細のURL遷移", () => {
  it("店舗を切り替えても表示タブと戻り先を維持する", () => {
    expect(mergeUserDetailSearch({ shop: "shop-a", tab: "line", returnTo: "settings" }, { shop: "shop-b" })).toEqual({
      shop: "shop-b",
      tab: "line",
      returnTo: "settings",
    });
  });

  it("タブを切り替えても表示店舗と戻り先を維持する", () => {
    expect(
      mergeUserDetailSearch({ shop: "shop-b", tab: "information", returnTo: "dashboard" }, { tab: "notification" }),
    ).toEqual({ shop: "shop-b", tab: "notification", returnTo: "dashboard" });
  });

  it("グループ設定へ現在表示中の店舗を引き継いで戻る", () => {
    expect(getUserDetailBackDestination("settings", "shop-b")).toEqual({
      to: "/settings",
      search: { shop: "shop-b" },
    });
  });

  it("Dashboardへ現在表示中の店舗を引き継いで戻る", () => {
    expect(getUserDetailBackDestination("dashboard", "shop-b")).toEqual({
      to: "/dashboard",
      search: { shop: "shop-b" },
    });
  });
});
