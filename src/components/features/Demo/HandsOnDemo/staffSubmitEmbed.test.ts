import { describe, expect, it } from "vitest";
import {
  buildStaffSubmitSrc,
  HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE,
  HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE,
  isStaffSubmitDoneMessage,
  readStaffSubmitProgress,
} from "./staffSubmitEmbed";

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

  it.each([
    ["始まり", 0, "choose"],
    ["途中", 3 / 8, "memo"],
    ["休みに戻すボタンを示すところ", 7 / 8, "remove"],
    ["終わり", 1, "update"],
  ] as const)("進み具合の知らせから、%sの割合と手順を読み取る", (_name, progress, step) => {
    expect(readStaffSubmitProgress({ type: HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE, progress, step })).toEqual({
      progress,
      step,
    });
  });

  it.each([
    ["0より小さい割合", { type: HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE, progress: -0.1, step: "choose" }],
    ["1より大きい割合", { type: HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE, progress: 1.2, step: "choose" }],
    ["数でない割合", { type: HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE, progress: "0.5", step: "choose" }],
    ["NaNの割合", { type: HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE, progress: Number.NaN, step: "choose" }],
    ["割合のない知らせ", { type: HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE, step: "choose" }],
    ["知らない手順", { type: HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE, progress: 0.5, step: "other" }],
    ["手順のない知らせ", { type: HANDS_ON_STAFF_SUBMIT_PROGRESS_MESSAGE, progress: 0.5 }],
    ["提出を終えた知らせ", { type: HANDS_ON_STAFF_SUBMIT_DONE_MESSAGE, progress: 0.5, step: "choose" }],
    ["空の知らせ", null],
  ])("%sは、進み具合として読まない", (_name, data) => {
    expect(readStaffSubmitProgress(data)).toBeNull();
  });
});
