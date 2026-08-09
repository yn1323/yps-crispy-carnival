import { describe, expect, it } from "vitest";
import { validateSettingsSearch } from "./settings";

describe("組織設定URL", () => {
  it("表示タブとユーザー一覧の復帰状態を受け付ける", () => {
    expect(validateSettingsSearch({ tab: "people", users: "40", focus: "person-b" })).toEqual({
      tab: "people",
      users: 40,
      focus: "person-b",
    });
  });

  it("不正な値はURL状態から除く", () => {
    expect(validateSettingsSearch({ tab: "unknown", users: "41", focus: "" })).toEqual({});
  });
});
