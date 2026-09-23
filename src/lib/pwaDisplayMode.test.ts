// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCurrentDocumentStandaloneLaunchAt,
  isCurrentWindowStandaloneWebApp,
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
  const setDocument = ({ initialPath, referrer }: { initialPath: string; referrer: string }) => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: `${window.location.origin}${initialPath}` } as PerformanceNavigationTiming,
    ]);
    vi.spyOn(document, "referrer", "get").mockReturnValue(referrer);
  };

  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ホーム画面から対象pathを開いた起動として扱う", () => {
    setDocument({ initialPath: "/", referrer: "" });

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(true);
  });

  it("外部サイトから開いた場合も起動として扱う", () => {
    setDocument({ initialPath: "/", referrer: "https://example.com/" });

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(true);
  });

  it("アプリ内のリンクから対象pathへ移動した場合は起動として扱わない", () => {
    setDocument({ initialPath: "/", referrer: `${window.location.origin}/login` });

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(false);
  });

  it("別pathで起動した後のクライアント遷移は起動として扱わない", () => {
    setDocument({ initialPath: "/demo/shiftboard", referrer: "" });

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(false);
  });

  it("通常ブラウザでは起動として扱わない", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    setDocument({ initialPath: "/", referrer: "" });

    expect(isCurrentDocumentStandaloneLaunchAt("/")).toBe(false);
  });
});
