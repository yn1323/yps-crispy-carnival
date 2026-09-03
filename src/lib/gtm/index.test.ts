// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { initGTM, isGtmInitialized, pushGtmEvent, resetGTM, stopGTM } from ".";

const pageView = {
  event: "page_view",
  app_environment: "preview",
  release_id: "release-1",
  route_family: "home",
} as const;

describe("GTM transport", () => {
  beforeEach(() => {
    resetGTM();
    window.dataLayer = [];
  });

  it.each(["", "G-TEST123", "GTM-invalid/value"])("不正なGTM ID %s ではscriptを追加しない", (gtmId) => {
    expect(initGTM(gtmId)).toBe(false);
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it("有効なIDでscriptと開始eventを一度だけ追加する", () => {
    expect(initGTM("GTM-TEST123")).toBe(true);
    expect(initGTM("GTM-TEST123")).toBe(false);

    expect(document.head.querySelectorAll('script[src*="googletagmanager"]').length).toBe(1);
    expect(document.head.querySelector('script[src*="googletagmanager"]')?.getAttribute("src")).toBe(
      "https://www.googletagmanager.com/gtm.js?id=GTM-TEST123",
    );
    expect(window.dataLayer).toEqual([expect.objectContaining({ event: "gtm.js", "gtm.start": expect.any(Number) })]);
    expect(document.body.querySelector("noscript")).toBeNull();
  });

  it("初期化前にdataLayerへ積まれた値を破棄してから開始する", () => {
    window.dataLayer = [pageView];

    expect(initGTM("GTM-TEST123")).toBe(true);

    expect(window.dataLayer).toEqual([expect.objectContaining({ event: "gtm.js", "gtm.start": expect.any(Number) })]);
  });

  it("既存GTM scriptがあるdocumentはbufferとloaderをbest-effortで破棄して再利用しない", () => {
    const script = document.createElement("script");
    script.src = "https://www.googletagmanager.com/gtm.js?id=GTM-EXTERNAL";
    document.body.appendChild(script);
    window.dataLayer = [pageView];

    expect(initGTM("GTM-TEST123")).toBe(false);
    expect(isGtmInitialized()).toBe(false);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer).toEqual([]);
    expect(initGTM("GTM-TEST123")).toBe(false);
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it("初期化前のeventをbufferせず破棄する", () => {
    expect(pushGtmEvent(pageView)).toBe(false);
    expect(window.dataLayer).toEqual([]);

    initGTM("GTM-TEST123");
    expect(window.dataLayer).toEqual([expect.objectContaining({ event: "gtm.js", "gtm.start": expect.any(Number) })]);
  });

  it("初期化後はexact payloadをdataLayerへ渡す", () => {
    initGTM("GTM-TEST123");
    expect(pushGtmEvent(pageView)).toBe(true);
    expect(window.dataLayer?.at(-1)).toEqual(pageView);
  });

  it("dataLayer transportが例外になっても製品操作へ伝播させない", () => {
    initGTM("GTM-TEST123");
    window.dataLayer = new Proxy([], {
      get(target, property, receiver) {
        if (property === "push") throw new Error("transport unavailable");
        return Reflect.get(target, property, receiver);
      },
    });

    expect(() => pushGtmEvent(pageView)).not.toThrow();
    expect(pushGtmEvent(pageView)).toBe(false);
  });

  it("停止後はscriptを外し、新しいeventを受け付けない", () => {
    initGTM("GTM-TEST123");
    stopGTM();

    expect(isGtmInitialized()).toBe(false);
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(pushGtmEvent(pageView)).toBe(false);
    expect(window.dataLayer).toEqual([]);
  });
});
