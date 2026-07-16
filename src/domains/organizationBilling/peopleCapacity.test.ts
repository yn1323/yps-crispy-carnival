import { describe, expect, it } from "vitest";
import { classifyPeopleCapacityError, resolvePeopleCapacityLimit } from "./peopleCapacity";

describe("classifyPeopleCapacityError", () => {
  it("Proの利用人数上限はBusinessへの変更として分類する", () => {
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます（現在 15名 / 上限 15名）")).toEqual({
      kind: "upgradeToBusiness",
      current: 15,
      max: 15,
    });
  });

  it("BusinessからProへの変更予約中は予約取消として分類する", () => {
    expect(classifyPeopleCapacityError("Proプランへの変更予約を取り消してから追加してください")).toEqual({
      kind: "cancelScheduledProChange",
    });
  });

  it("30名上限は問い合わせとして現在の利用状況を保持する", () => {
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます（現在 30名 / 上限 30名）")).toEqual({
      kind: "contact",
      current: 30,
      max: 30,
    });
  });

  it("Freeの利用人数上限は有料プランの選択として分類する", () => {
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます（現在 4名 / 上限 4名）")).toEqual({
      kind: "choosePaidPlan",
      current: 4,
      max: 4,
    });
  });

  it("別の業務エラーや利用状況を含まない文言は分類しない", () => {
    expect(classifyPeopleCapacityError("このメールアドレスは既に使用されています")).toBeNull();
    expect(classifyPeopleCapacityError("利用人数が現在のプラン上限を超えます")).toBeNull();
    expect(classifyPeopleCapacityError(undefined)).toBeNull();
  });

  it("画面で取得済みのPro利用状況も同じ解決方法へ変換する", () => {
    expect(resolvePeopleCapacityLimit(15, 15)).toEqual({ kind: "upgradeToBusiness", current: 15, max: 15 });
  });
});
