// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  RANGE_ASSIGN_HINT_STORAGE_KEY,
  readRangeAssignHintDismissed,
  storeRangeAssignHintDismissed,
} from "./rangeAssignHintStorage";

describe("バーの範囲を選んで入れる操作の案内を、端末に覚える", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("まだ入れたことのない端末では、案内を出す", () => {
    expect(readRangeAssignHintDismissed()).toBe(false);
  });

  it("一度入れたことを覚えると、読み直しても案内を出さない", () => {
    storeRangeAssignHintDismissed();

    expect(readRangeAssignHintDismissed()).toBe(true);
    expect(window.localStorage.getItem(RANGE_ASSIGN_HINT_STORAGE_KEY)).toBe("dismissed");
  });

  it("知らない値が入っている端末では、案内を出す", () => {
    window.localStorage.setItem(RANGE_ASSIGN_HINT_STORAGE_KEY, "true");

    expect(readRangeAssignHintDismissed()).toBe(false);
  });
});
