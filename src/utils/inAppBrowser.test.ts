import { describe, expect, it } from "vitest";
import { isLineInAppBrowser } from "./inAppBrowser";

describe("isLineInAppBrowser", () => {
  it("iOSのLINEアプリ内ブラウザを検出する", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.5.0";
    expect(isLineInAppBrowser(ua)).toBe(true);
  });

  it("AndroidのLINEアプリ内ブラウザを検出する", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 Line/14.6.1/IAB";
    expect(isLineInAppBrowser(ua)).toBe(true);
  });

  it("通常のモバイルSafariは検出しない", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(isLineInAppBrowser(ua)).toBe(false);
  });

  it("通常のChromeは検出しない", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    expect(isLineInAppBrowser(ua)).toBe(false);
  });
});
