// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, useDismissedAnnouncements } from "./useDismissedAnnouncements";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("お知らせの削除状態", () => {
  it("保存済みの削除状態を初回から読み、IDを重複させずに追加保存する", () => {
    localStorage.setItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(["previous"]));
    const { result } = renderHook(useDismissedAnnouncements);
    expect(result.current.dismissedIds).toEqual(["previous"]);

    act(() => result.current.dismissAnnouncement("current"));
    act(() => result.current.dismissAnnouncement("current"));

    expect(result.current.dismissedIds).toEqual(["previous", "current"]);
    expect(JSON.parse(localStorage.getItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY) ?? "null")).toEqual([
      "previous",
      "current",
    ]);
  });

  it("表示後に別タブで保存された削除済みIDを上書きで失わない", () => {
    const { result } = renderHook(useDismissedAnnouncements);
    localStorage.setItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(["other-tab"]));

    act(() => result.current.dismissAnnouncement("current"));

    expect(JSON.parse(localStorage.getItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY) ?? "null")).toEqual([
      "other-tab",
      "current",
    ]);
  });

  it.each(["{broken", "null", '{"id":"announcement"}'])("不正な保存値 %s でも削除を続けられる", (value) => {
    localStorage.setItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, value);
    const { result } = renderHook(useDismissedAnnouncements);
    expect(result.current.dismissedIds).toEqual([]);

    act(() => result.current.dismissAnnouncement("current"));

    expect(JSON.parse(localStorage.getItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY) ?? "null")).toEqual(["current"]);
  });

  it("保存値にID以外の型が混ざっていても有効な削除済みIDを残す", () => {
    localStorage.setItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify([null, 1, {}, "previous"]));

    const { result } = renderHook(useDismissedAnnouncements);

    expect(result.current.dismissedIds).toEqual(["previous"]);
  });

  it("LocalStorageへアクセスできなくても現在の画面で削除状態を保つ", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const { result } = renderHook(useDismissedAnnouncements);
    expect(result.current.dismissedIds).toEqual([]);

    act(() => result.current.dismissAnnouncement("first"));
    act(() => result.current.dismissAnnouncement("second"));

    expect(result.current.dismissedIds).toEqual(["first", "second"]);
  });
});
