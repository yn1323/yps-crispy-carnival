// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCurrentDocumentStandaloneLaunchAt,
  isCurrentWindowStandaloneWebApp,
  recordAppDocumentLoad,
  STANDALONE_DISPLAY_QUERY,
} from "./pwaDisplayMode";

beforeEach(() => {
  Object.defineProperty(window.navigator, "standalone", {
    configurable: true,
    value: false,
  });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

describe("PWA display mode", () => {
  it("通常ブラウザをstandaloneとして扱わない", () => {
    expect(isCurrentWindowStandaloneWebApp()).toBe(false);
    expect(window.matchMedia).toHaveBeenCalledWith(STANDALONE_DISPLAY_QUERY);
  });

  it("display-modeがstandaloneならPWA起動として扱う", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });

    expect(isCurrentWindowStandaloneWebApp()).toBe(true);
  });

  it("iOSのnavigator.standaloneでもPWA起動として扱う", () => {
    Object.defineProperty(window.navigator, "standalone", {
      configurable: true,
      value: true,
    });

    expect(isCurrentWindowStandaloneWebApp()).toBe(true);
  });
});

describe("standalone起動の判定", () => {
  const loadDocument = (initialPath: string) => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: `${window.location.origin}${initialPath}` } as PerformanceNavigationTiming,
    ]);
    recordAppDocumentLoad();
  };

  beforeEach(() => {
    window.sessionStorage.clear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ホーム画面から対象pathを開いた起動として扱う", () => {
    loadDocument("/");

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(true);
  });

  it("同じウィンドウでアプリを開いた後に対象pathを読み込んだ場合は起動として扱わない", () => {
    loadDocument("/login");
    loadDocument("/");

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(false);
  });

  it("sessionStorageを使えない場合は起動として扱う", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    loadDocument("/");

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(true);
  });

  it("別pathで起動した後のクライアント遷移は起動として扱わない", () => {
    loadDocument("/demo/shiftboard");

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(false);
  });

  it("通常ブラウザでは起動として扱わない", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    loadDocument("/");

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(false);
  });
});
