// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStoredDetailMode, storeDetailMode } from "./detailModeStorage";

const STORAGE_KEY = "shiftori:shiftBoard:detailMode";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("シフト表の表示の選択を端末に覚える", () => {
  it("まだ選んでいない端末ではnullを返す", () => {
    expect(readStoredDetailMode()).toBeNull();
  });

  it("「くわしく」を保存すると、読み戻しでtrueを返す", () => {
    storeDetailMode(true);

    expect(readStoredDetailMode()).toBe(true);
  });

  it("「シンプル」を保存すると、読み戻しでfalseを返す", () => {
    storeDetailMode(false);

    expect(readStoredDetailMode()).toBe(false);
  });

  it("選び直すと、あとから選んだ表示を返す", () => {
    storeDetailMode(true);
    storeDetailMode(false);
    expect(readStoredDetailMode()).toBe(false);

    storeDetailMode(true);
    expect(readStoredDetailMode()).toBe(true);
  });

  it.each(["", "true", "false", "1", "DETAIL", "{}"])("知らない値（%j）が入っている場合はnullを返す", (value) => {
    window.localStorage.setItem(STORAGE_KEY, value);

    expect(readStoredDetailMode()).toBeNull();
  });

  it("ほかの保存値には触れない", () => {
    window.localStorage.setItem("another-key", "kept");

    storeDetailMode(true);

    expect(window.localStorage.getItem("another-key")).toBe("kept");
    expect(window.localStorage.length).toBe(2);
  });

  it("読み出しで例外が出る環境でも、落ちずにnullを返す", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(readStoredDetailMode()).toBeNull();
  });

  it("保存で例外が出る環境でも落ちず、次の読み出しは未選択として扱う", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => storeDetailMode(true)).not.toThrow();
    expect(readStoredDetailMode()).toBeNull();
  });
});
