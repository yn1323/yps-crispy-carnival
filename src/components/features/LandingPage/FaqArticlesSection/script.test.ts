import { describe, expect, it } from "vitest";
import { splitLandingFaqAnswerSentences } from "./script";

describe("トップページFAQの回答表示", () => {
  it("句点ごとに次の文を改行する", () => {
    expect(splitLandingFaqAnswerSentences("一文目です。 二文目です。三文目です。")).toEqual([
      "一文目です。",
      "二文目です。",
      "三文目です。",
    ]);
  });
});
