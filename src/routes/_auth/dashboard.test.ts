import { describe, expect, it } from "vitest";
import { validateDashboardSearch } from "./dashboard";

describe("Dashboard URL", () => {
  it("ユーザー一覧の表示件数と復帰対象を受け付ける", () => {
    expect(validateDashboardSearch({ users: "20", focus: "person-a", ignored: "value" })).toEqual({
      users: 20,
      focus: "person-a",
    });
  });

  it("既定件数と空の復帰対象はURL状態から除く", () => {
    expect(validateDashboardSearch({ users: "10", focus: " " })).toEqual({});
  });
});
