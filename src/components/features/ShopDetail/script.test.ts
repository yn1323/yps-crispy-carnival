import { describe, expect, it } from "vitest";
import { getShopStaffs } from "./script";
import type { ShopDetailPerson } from "./types";

const people: ShopDetailPerson[] = [
  {
    id: "person-1",
    name: "田中 太郎",
    managerRole: "active",
    shopNames: ["渋谷店", "新宿店"],
    shopIds: ["shop-shibuya", "shop-shinjuku"],
  },
  {
    id: "person-2",
    name: "佐藤 花子",
    managerRole: "none",
    shopNames: ["同名店"],
    shopIds: ["shop-same-a"],
  },
  {
    id: "person-3",
    name: "鈴木 次郎",
    managerRole: "none",
    shopNames: ["同名店"],
    shopIds: ["shop-same-b"],
  },
];

describe("店舗詳細のスタッフ一覧", () => {
  it("店舗名ではなく店舗IDで所属を判定し、元の並び順を保つ", () => {
    expect(getShopStaffs(people, "shop-same-a").map((person) => person.id)).toEqual(["person-2"]);
    expect(getShopStaffs(people, "shop-shinjuku").map((person) => person.id)).toEqual(["person-1"]);
  });

  it("対象店舗に所属するユーザーがいない場合は空配列を返す", () => {
    expect(getShopStaffs(people, "shop-none")).toEqual([]);
  });
});
