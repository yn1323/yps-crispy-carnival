import { describe, expect, it } from "vitest";
import { selectChannel } from "./notification";

describe("selectChannel", () => {
  it("連携済みかつ友達追加中・quota normal なら line", () => {
    expect(selectChannel({ lineUserId: "U123", lineFollowing: true }, { status: "normal" })).toBe("line");
  });

  it("quota exceeded なら全員 email", () => {
    expect(selectChannel({ lineUserId: "U123", lineFollowing: true }, { status: "exceeded" })).toBe("email");
  });

  it("quota が null（cron 未実行）なら安全側で email", () => {
    expect(selectChannel({ lineUserId: "U123", lineFollowing: true }, null)).toBe("email");
  });

  it("未連携なら email", () => {
    expect(selectChannel({}, { status: "normal" })).toBe("email");
  });

  it("連携済みでも友達解除中なら email", () => {
    expect(selectChannel({ lineUserId: "U123", lineFollowing: false }, { status: "normal" })).toBe("email");
  });
});
