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
      mergeUserDetailSearch({ shop: "shop-b", tab: "line", returnTo: "dashboard" }, { tab: "notification" }),
    ).toEqual({ shop: "shop-b", tab: "notification", returnTo: "dashboard" });
  });

  it("グループ設定へ現在表示中の店舗を引き継いで戻る", () => {
    expect(getUserDetailBackDestination("settings", "shop-b", 30, "person-a")).toEqual({
      to: "/settings",
      search: { shop: "shop-b", users: 30, focus: "person-a" },
    });
  });

  it("Dashboardへ現在表示中の店舗を引き継いで戻る", () => {
    expect(getUserDetailBackDestination("dashboard", "shop-b", 10, "person-b")).toEqual({
      to: "/dashboard",
      search: { shop: "shop-b", users: undefined, focus: "person-b" },
    });
  });

  it("店舗詳細へ表示中の店舗を引き継いで戻る", () => {
    expect(getUserDetailBackDestination("shopDetail", "shop-b", 10, "person-b")).toEqual({
      to: "/shops/$shopId",
      params: { shopId: "shop-b" },
      search: { shop: "shop-b" },
    });
  });

  it("ユーザー詳細内で店舗を切り替えても出発元の店舗詳細へ戻る", () => {
    expect(getUserDetailBackDestination("shopDetail", "shop-b", 10, "person-b", "shop-a")).toEqual({
      to: "/shops/$shopId",
      params: { shopId: "shop-a" },
      search: { shop: "shop-a" },
    });
  });
});
