// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { initGTM, resetGTM, sendEvent, sendPageView } from ".";

describe("GTM ヘルパー", () => {
  beforeEach(() => {
    resetGTM();
    window.dataLayer = [];
    for (const el of document.head.querySelectorAll('script[src*="googletagmanager"]')) el.remove();
    for (const el of document.body.querySelectorAll("noscript")) el.remove();
  });

  describe("initGTM", () => {
    it("GTM IDが空の場合は何もしない", () => {
      initGTM("");
      expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
    });

    it("スクリプトタグがDOMに挿入される", () => {
      initGTM("GTM-TEST123");
      const script = document.head.querySelector('script[src*="googletagmanager"]');
      expect(script).not.toBeNull();
      expect(script?.getAttribute("src")).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-TEST123");
    });

    it("noscriptフォールバックがbodyに挿入される", () => {
      initGTM("GTM-TEST123");
      const noscript = document.body.querySelector("noscript");
      expect(noscript).not.toBeNull();
      const iframe = noscript?.querySelector("iframe");
      expect(iframe?.getAttribute("src")).toBe("https://www.googletagmanager.com/ns.html?id=GTM-TEST123");
    });

    it("dataLayerにgtm.startイベントがpushされる", () => {
      initGTM("GTM-TEST123");
      expect(window.dataLayer).toEqual(
        expect.arrayContaining([expect.objectContaining({ event: "gtm.js", "gtm.start": expect.any(Number) })]),
      );
    });

    it("二重初期化を防止する", () => {
      initGTM("GTM-TEST123");
      initGTM("GTM-TEST123");
      const scripts = document.head.querySelectorAll('script[src*="googletagmanager"]');
      expect(scripts.length).toBe(1);
    });
  });

  describe("sendPageView", () => {
    it("初期化済みならpage_viewイベントがpushされる", () => {
      initGTM("GTM-TEST123");
      sendPageView("/dashboard");
      expect(window.dataLayer).toEqual(
        expect.arrayContaining([expect.objectContaining({ event: "page_view", page_path: "/dashboard" })]),
      );
    });

    it("未初期化ならpushされない", () => {
      window.dataLayer = [];
      sendPageView("/dashboard");
      expect(window.dataLayer).toEqual([]);
    });
  });

  describe("sendEvent", () => {
    it("カスタムイベントがpushされる", () => {
      initGTM("GTM-TEST123");
      sendEvent("click_button", { button_name: "submit" });
      expect(window.dataLayer).toEqual(
        expect.arrayContaining([expect.objectContaining({ event: "click_button", button_name: "submit" })]),
      );
    });

    it("paramsなしでもpushできる", () => {
      initGTM("GTM-TEST123");
      sendEvent("scroll_to_bottom");
      expect(window.dataLayer).toEqual(
        expect.arrayContaining([expect.objectContaining({ event: "scroll_to_bottom" })]),
      );
    });

    it("未初期化ならpushされない", () => {
      window.dataLayer = [];
      sendEvent("click_button");
      expect(window.dataLayer).toEqual([]);
    });
  });
});
