import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_LIST_COUNT,
  parseFocusedUserId,
  parseUserListCount,
  parseUserListSearch,
  toUserListCountSearch,
  updateUserListSearch,
} from "./userListSearch";

describe("ユーザー一覧のURL状態", () => {
  it.each([
    ["20", 20],
    [30, 30],
    ["200", 200],
  ])("表示件数 %s を10件単位の有効値として受け付ける", (value, expected) => {
    expect(parseUserListCount(value)).toBe(expected);
  });

  it.each([undefined, null, "", "10", 10, "25", -20, "201", Number.NaN])(
    "不正または既定の表示件数 %s はURL状態から除く",
    (value) => {
      expect(parseUserListCount(value)).toBeUndefined();
    },
  );

  it("既定件数は省略し、もっと見るで増えた件数だけURLへ保持する", () => {
    expect(toUserListCountSearch(DEFAULT_USER_LIST_COUNT)).toBeUndefined();
    expect(toUserListCountSearch(20)).toBe(20);
    expect(toUserListCountSearch(210)).toBeUndefined();
  });

  it("復帰対象のユーザーIDを空白除去して保持する", () => {
    expect(parseFocusedUserId(" person-a ")).toBe("person-a");
    expect(parseFocusedUserId(" ")).toBeUndefined();
    expect(parseFocusedUserId("a".repeat(129))).toBeUndefined();
  });

  it("一覧URLの既存条件を保ったまま表示件数を更新し、古い復帰対象を消す", () => {
    expect(updateUserListSearch({ shop: "shop-a", users: 20, focus: "person-a" }, { count: 30 })).toEqual({
      shop: "shop-a",
      users: 30,
      focus: undefined,
    });
  });

  it("一覧URLの検証では無関係なqueryを返さない", () => {
    expect(parseUserListSearch({ users: "20", focus: "person-a", ignored: "value" })).toEqual({
      users: 20,
      focus: "person-a",
    });
  });
});
