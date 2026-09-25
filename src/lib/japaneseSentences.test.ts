import { describe, expect, it } from "vitest";
import { splitJapaneseSentences } from "./japaneseSentences";

describe("splitJapaneseSentences", () => {
  it("句点ごとに分け、前後の空白と空の文を除く", () => {
    expect(splitJapaneseSentences("一文目です。 二文目です。\n三文目です。")).toEqual([
      "一文目です。",
      "二文目です。",
      "三文目です。",
    ]);
  });

  it("句点で終わらない最後の文も残す", () => {
    expect(splitJapaneseSentences("一文目です。二文目")).toEqual(["一文目です。", "二文目"]);
  });
});
