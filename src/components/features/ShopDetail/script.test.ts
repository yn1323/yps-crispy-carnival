import { describe, expect, it } from "vitest";
import { getShopBasicInformationRows, getShopStaffs } from "./script";
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
  {
    id: "person-4",
    name: "高橋 三郎",
    managerRole: "none",
    shopNames: ["新宿店"],
    shopIds: ["shop-shinjuku"],
  },
];

describe("店舗詳細のスタッフ一覧", () => {
  it("店舗名ではなく店舗IDで所属を判定し、元の並び順を保つ", () => {
    expect(getShopStaffs(people, "shop-same-a").map((person) => person.id)).toEqual(["person-2"]);
    expect(getShopStaffs(people, "shop-shinjuku").map((person) => person.id)).toEqual(["person-1", "person-4"]);
  });

  it("対象店舗に所属するユーザーがいない場合は空配列を返す", () => {
    expect(getShopStaffs(people, "shop-none")).toEqual([]);
  });
});

describe("店舗詳細の基本情報", () => {
  it("時間指定の勤務時間と定休日を読み取り用の行へ整形する", () => {
    expect(
      getShopBasicInformationRows({
        name: "渋谷店",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "25:00" },
        regularClosedDays: ["fri", "sun"],
      }),
    ).toEqual([
      { label: "店舗名", value: "渋谷店" },
      { label: "希望シフトの集め方", value: "時間指定" },
      { label: "勤務時間", value: "09:00〜翌1:00" },
      { label: "定休日", value: "毎週 金・日" },
    ]);
  });

  it("日ごとは勤務時間の行を出さず、定休日なしと表示する", () => {
    expect(
      getShopBasicInformationRows({
        name: "新宿店",
        submissionPattern: { kind: "dateOnly" },
        regularClosedDays: [],
      }),
    ).toEqual([
      { label: "店舗名", value: "新宿店" },
      { label: "希望シフトの集め方", value: "日ごと" },
      { label: "定休日", value: "定休日なし" },
    ]);
  });

  it("勤務区分はすべての区分名と時間を表示する", () => {
    expect(
      getShopBasicInformationRows({
        name: "池袋店",
        submissionPattern: {
          kind: "shiftType",
          options: [
            { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
          ],
        },
        regularClosedDays: ["wed"],
      }),
    ).toEqual([
      { label: "店舗名", value: "池袋店" },
      { label: "希望シフトの集め方", value: "勤務区分" },
      { label: "勤務区分", value: "早番（09:00〜15:00）、遅番（15:00〜21:00）" },
      { label: "定休日", value: "毎週 水" },
    ]);
  });
});
