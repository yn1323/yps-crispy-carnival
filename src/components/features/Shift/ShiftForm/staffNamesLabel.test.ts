import { describe, expect, it } from "vitest";
import { buildStaffNamesLabel } from "./staffNamesLabel";

describe("buildStaffNamesLabel", () => {
  it("3人までは、名字だけを「・」でつなぎ、人数を足さない", () => {
    expect(buildStaffNamesLabel(["中村 さくら"])).toBe("中村");
    expect(buildStaffNamesLabel(["中村 さくら", "高橋 翔", "伊藤 大輔"])).toBe("中村・高橋・伊藤");
  });

  it("4人目からは名前を出さず、「ほか○人」にまとめる", () => {
    expect(buildStaffNamesLabel(["中村 さくら", "高橋 翔", "伊藤 大輔", "佐藤 健太"])).toBe(
      "中村・高橋・伊藤・ほか1人",
    );
    expect(buildStaffNamesLabel(["中村 さくら", "高橋 翔", "伊藤 大輔", "佐藤 健太", "鈴木 美咲"])).toBe(
      "中村・高橋・伊藤・ほか2人",
    );
  });

  it("全角の空白でも名字と名前を分け、前後の空白は名字に含めない", () => {
    expect(buildStaffNamesLabel(["山田　陽菜", "  木村 湊 "])).toBe("山田・木村");
  });

  it("空白のない名前は、そのまま出す", () => {
    expect(buildStaffNamesLabel(["yn1323", "スタッフ"])).toBe("yn1323・スタッフ");
  });

  it("空白だけの名前は、元の名前のまま出す", () => {
    expect(buildStaffNamesLabel(["  "])).toBe("  ");
  });

  it("だれもいないときは空の文字にする", () => {
    expect(buildStaffNamesLabel([])).toBe("");
  });
});
