// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { isCurrentWindowStandaloneWebApp, STANDALONE_DISPLAY_QUERY } from "./pwaDisplayMode";

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
