// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { lastPositionStorageKey, readLastPositionId, storeLastPositionId } from "./lastPositionStorage";

describe("最後に選んだポジションを、店舗ごとに端末へ覚える", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("まだ選んでいない店舗ではnullを返す", () => {
    expect(readLastPositionId("shop-1")).toBeNull();
  });

  it("覚えたポジションを、同じ店舗でだけ読める", () => {
    storeLastPositionId("shop-1", "kitchen");

    expect(readLastPositionId("shop-1")).toBe("kitchen");
    expect(readLastPositionId("shop-2")).toBeNull();
    expect(window.localStorage.getItem(lastPositionStorageKey("shop-1"))).toBe("kitchen");
  });

  it("選び直すと、あとから選んだポジションに置き換える", () => {
    storeLastPositionId("shop-1", "kitchen");
    storeLastPositionId("shop-1", "hall");

    expect(readLastPositionId("shop-1")).toBe("hall");
  });
});
