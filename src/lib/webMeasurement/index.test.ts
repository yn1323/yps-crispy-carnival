// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasActiveWebMeasurement,
  initializeDocumentWebMeasurement,
  isWebMeasurementRuntimeEnabled,
  resetWebMeasurementForTests,
  stopDocumentWebMeasurement,
  trackPublicCta,
  trackPublicPageView,
} from ".";

const config = {
  enabled: true,
  environment: "preview",
  gtmId: "GTM-TEST123",
  releaseId: "release-1",
  webVitalsSampleRate: 1,
} as const;

describe("Web計測runtime", () => {
  beforeEach(() => {
    resetWebMeasurementForTests();
    window.dataLayer = [];
  });

  it.each([
    [{ ...config, enabled: false }, false],
    [{ ...config, gtmId: "G-invalid" }, false],
    [{ ...config, environment: "local" }, false],
    [{ ...config, environment: "staging" }, false],
    [{ ...config, releaseId: "unknown" }, false],
    [{ ...config, releaseId: "local" }, false],
    [{ ...config, releaseId: "secret/value" }, false],
    [{ ...config, environment: "develop" }, true],
    [{ ...config, environment: "preview" }, true],
    [{ ...config, environment: "production" }, true],
  ] as const)("deploy環境・releaseを含むdefault-closed gateを適用する", (candidate, expected) => {
    expect(isWebMeasurementRuntimeEnabled(candidate)).toBe(expected);
  });

  it.each([
    "/dashboard",
    "/login?redirect=/dashboard",
    "/shifts/submit?token=secret",
    "/line/callback?code=secret&state=secret",
    "/unknown",
  ])("direct load %s ではthird-party scriptもeventも作らない", (initialDocumentPathname) => {
    expect(
      initializeDocumentWebMeasurement({
        config,
        currentPathname: initialDocumentPathname,
        initialDocumentPathname,
        viewportWidth: 1280,
      }),
    ).toBe("closed_surface");
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(window.dataLayer).toEqual([]);
  });

  it("明示enableされた公開documentだけを初期化し、初回page viewを一度送る", () => {
    const reportVitals = vi.fn(async () => {});
    const args = {
      config,
      currentPathname: "/articles/shiftori-line-workflow?token=secret",
      initialDocumentPathname: "/articles/shiftori-line-workflow?token=secret",
      viewportWidth: 375,
    };

    expect(initializeDocumentWebMeasurement(args, { random: () => 0, reportVitals })).toBe("initialized");
    expect(initializeDocumentWebMeasurement(args, { random: () => 0, reportVitals })).toBe("initialized");

    expect(document.head.querySelectorAll('script[src*="googletagmanager"]').length).toBe(1);
    expect(window.dataLayer?.filter((event) => event.event === "page_view")).toEqual([
      {
        event: "page_view",
        app_environment: "preview",
        release_id: "release-1",
        route_family: "article_detail",
      },
    ]);
    expect(reportVitals).toHaveBeenCalledTimes(1);
  });

  it("同一pathの重複を止め、別記事へのSPA遷移は同じ有限familyで送る", () => {
    initializeDocumentWebMeasurement(
      {
        config: { ...config, webVitalsSampleRate: 0 },
        currentPathname: "/articles/first",
        initialDocumentPathname: "/articles/first",
        viewportWidth: 1280,
      },
      { random: () => 0 },
    );

    expect(trackPublicPageView("/articles/first?query=ignored")).toBe(false);
    expect(trackPublicPageView("/articles/second")).toBe(true);
    expect(window.dataLayer?.filter((event) => event.event === "page_view")).toEqual([
      expect.objectContaining({ route_family: "article_detail" }),
      expect.objectContaining({ route_family: "article_detail" }),
    ]);
  });

  it("CTAを登録済みpayloadだけで送る", () => {
    initializeDocumentWebMeasurement({
      config: { ...config, webVitalsSampleRate: 0 },
      currentPathname: "/",
      initialDocumentPathname: "/",
      viewportWidth: 1280,
    });

    expect(trackPublicCta("hero_signup", "/")).toBe(true);
    expect(window.dataLayer?.at(-1)).toEqual(
      expect.objectContaining({ event: "select_content", content_id: "hero_signup" }),
    );
  });

  it("Web Vitalsのdocument routeはcallback時の現在routeへ変えない", async () => {
    let reporter: import("@/src/reportWebVitals").WebVitalsReporter = () => {};
    initializeDocumentWebMeasurement(
      {
        config,
        currentPathname: "/",
        initialDocumentPathname: "/",
        viewportWidth: 375,
      },
      {
        random: () => 0,
        reportVitals: async (nextReporter) => {
          reporter = nextReporter;
        },
      },
    );
    trackPublicPageView("/articles/second");
    reporter({
      name: "LCP",
      value: 1200,
      rating: "good",
      navigationType: "navigate",
      delta: 1200,
      id: "not-sent",
      entries: [],
    });
    await Promise.resolve();

    expect(window.dataLayer?.at(-1)).toEqual({
      event: "web_vital",
      app_environment: "preview",
      document_route_family: "home",
      metric_name: "LCP",
      metric_value: 1200,
      metric_rating: "good",
      navigation_type: "navigate",
      release_id: "release-1",
      viewport_class: "mobile",
    });
  });

  it("revoke時にruntimeとscriptを停止する", () => {
    initializeDocumentWebMeasurement({
      config: { ...config, webVitalsSampleRate: 0 },
      currentPathname: "/",
      initialDocumentPathname: "/",
      viewportWidth: 1280,
    });
    expect(hasActiveWebMeasurement()).toBe(true);

    stopDocumentWebMeasurement();
    expect(hasActiveWebMeasurement()).toBe(false);
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
});
