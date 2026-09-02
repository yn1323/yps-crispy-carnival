import { describe, expect, it } from "vitest";
import { classifyPeopleCapacityError, resolvePeopleCapacityLimit } from "./peopleCapacity";

describe("classifyPeopleCapacityError", () => {
  it("最上位プランの50名上限は追加不可として現在の利用状況を保持する", () => {
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます。\n現在50名、上限50名です。")).toEqual({
      kind: "limitReached",
      current: 50,
      max: 50,
    });
  });

  it("Freeの5名上限は有料プランの選択として分類する", () => {
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます。\n現在5名、上限5名です。")).toEqual({
      kind: "choosePaidPlan",
      current: 5,
      max: 5,
    });
  });

  it("別の業務エラーや利用状況を含まない文言は分類しない", () => {
    expect(classifyPeopleCapacityError("このメールアドレスはすでに使用されています。")).toBeNull();
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます")).toBeNull();
    expect(classifyPeopleCapacityError(undefined)).toBeNull();
  });

  it("FreeとStandardの現行・旧上限は有料プラン選択へ変換する", () => {
    expect(resolvePeopleCapacityLimit(5, 5)).toEqual({ kind: "choosePaidPlan", current: 5, max: 5 });
    expect(resolvePeopleCapacityLimit(4, 4)).toEqual({ kind: "choosePaidPlan", current: 4, max: 4 });
    expect(resolvePeopleCapacityLimit(25, 25)).toEqual({ kind: "choosePaidPlan", current: 25, max: 25 });
    expect(resolvePeopleCapacityLimit(20, 20)).toEqual({ kind: "choosePaidPlan", current: 20, max: 20 });
  });

  it("Proの現行・旧上限と未知の上限は追加不可へ変換する", () => {
    expect(resolvePeopleCapacityLimit(50, 50)).toEqual({ kind: "limitReached", current: 50, max: 50 });
    expect(resolvePeopleCapacityLimit(40, 40)).toEqual({ kind: "limitReached", current: 40, max: 40 });
    expect(resolvePeopleCapacityLimit(30, 30)).toEqual({ kind: "limitReached", current: 30, max: 30 });
  });
});
