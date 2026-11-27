import { describe, expect, it } from "vitest";
import { buildStaffSubmitSrc, HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE, isStaffSubmitDoneMessage } from "./staffSubmitEmbed";

describe("体験デモに読み込むスタッフの提出画面", () => {
  it("募集の初日をqueryに入れて読み込む", () => {
    expect(buildStaffSubmitSrc("2026-11-30")).toBe("/shifts/demo-submit?start=2026-11-30");
  });

  it.each([
    ["提出を終えた知らせ", { type: HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE }, true],
    ["種類の違う知らせ", { type: "other" }, false],
    ["文字列だけの知らせ", HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE, false],
    ["空の知らせ", null, false],
  ])("%sを見分ける", (_name, data, expected) => {
    expect(isStaffSubmitDoneMessage(data)).toBe(expected);
  });
});
