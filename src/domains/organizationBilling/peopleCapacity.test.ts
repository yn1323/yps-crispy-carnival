import { describe, expect, it } from "vitest";
import { classifyPeopleCapacityError, resolvePeopleCapacityLimit } from "./peopleCapacity";

describe("classifyPeopleCapacityError", () => {
  it("Proの30名上限は問い合わせとして現在の利用状況を保持する", () => {
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます（現在 30名 / 上限 30名）")).toEqual({
      kind: "contact",
      current: 30,
      max: 30,
    });
  });

  it("Freeの5名上限はProの選択として分類する", () => {
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます（現在 5名 / 上限 5名）")).toEqual({
      kind: "choosePaidPlan",
      current: 5,
      max: 5,
    });
  });

  it("別の業務エラーや利用状況を含まない文言は分類しない", () => {
    expect(classifyPeopleCapacityError("このメールアドレスは既に使用されています")).toBeNull();
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます")).toBeNull();
    expect(classifyPeopleCapacityError(undefined)).toBeNull();
  });

  it("画面で取得済みのFree利用状況も同じ解決方法へ変換する", () => {
    expect(resolvePeopleCapacityLimit(5, 5)).toEqual({ kind: "choosePaidPlan", current: 5, max: 5 });
    expect(resolvePeopleCapacityLimit(4, 4)).toEqual({ kind: "choosePaidPlan", current: 4, max: 4 });
  });
});
