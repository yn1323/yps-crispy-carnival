import { describe, expect, it } from "vitest";
import { getUserDetailBackDestination, getUserDetailRemovedDestination, mergeUserDetailSearch } from "./navigation";

describe("ユーザー詳細のURL遷移", () => {
  it("店舗を切り替えても表示パネルと戻り先を維持する", () => {
    expect(mergeUserDetailSearch({ shop: "shop-a", panel: "shop", returnTo: "settings" }, { shop: "shop-b" })).toEqual({
      shop: "shop-b",
      panel: "shop",
      returnTo: "settings",
    });
  });

  it("パネルを開いても表示店舗と戻り先を維持する", () => {
    expect(mergeUserDetailSearch({ shop: "shop-b", returnTo: "dashboard" }, { panel: "basic" })).toEqual({
      shop: "shop-b",
      panel: "basic",
      returnTo: "dashboard",
    });
  });

  it("パネルを閉じても表示店舗と戻り先を維持する", () => {
    expect(
      mergeUserDetailSearch({ shop: "shop-b", panel: "addShop", returnTo: "dashboard" }, { panel: undefined }),
    ).toEqual({ shop: "shop-b", panel: undefined, returnTo: "dashboard" });
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

  it("Dashboard起点の店舗詳細へ戻る場合は、その戻り先も引き継ぐ", () => {
    expect(getUserDetailBackDestination("shopDetail", "shop-b", 10, "person-b", "shop-a", "dashboard")).toEqual({
      to: "/shops/$shopId",
      params: { shopId: "shop-a" },
      search: { shop: "shop-a", returnTo: "dashboard" },
    });
  });

  it("Dashboard起点で人物を削除した後は削除済み人物へfocusしない", () => {
    expect(getUserDetailRemovedDestination("dashboard", "shop-b", 30)).toEqual({
      to: "/dashboard",
      search: { shop: "shop-b", users: 30 },
    });
  });

  it("設定起点で人物を削除した後はユーザー一覧へ戻り、削除済み人物へfocusしない", () => {
    expect(getUserDetailRemovedDestination("settings", "shop-b", 30)).toEqual({
      to: "/settings",
      search: { shop: "shop-b", tab: "people", users: 30 },
    });
  });

  it("店舗詳細起点で人物を削除した後は出発元の店舗詳細へ戻る", () => {
    expect(getUserDetailRemovedDestination("shopDetail", "shop-b", 10, "shop-a", "dashboard")).toEqual({
      to: "/shops/$shopId",
      params: { shopId: "shop-a" },
      search: { shop: "shop-a", returnTo: "dashboard" },
    });
  });
});
