import { describe, expect, it } from "vitest";
import { getShiftBoardReadOnlyReason } from "./useShiftBoardPageController";

describe("getShiftBoardReadOnlyReason", () => {
  it("上限超過は確定した超過として案内する", () => {
    expect(getShiftBoardReadOnlyReason("usageLimitExceeded")).toContain("プラン上限を超えているため");
  });

  it("利用数未確定を上限超過と断定しない", () => {
    const reason = getShiftBoardReadOnlyReason("usageLimitEvaluationUnavailable");

    expect(reason).toContain("利用数を安全に確認できないため");
    expect(reason).not.toContain("上限を超えて");
  });
});
