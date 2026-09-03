// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasActiveWebMeasurement,
  initializeDocumentWebMeasurement,
  isWebMeasurementRuntimeEnabled,
  resetWebMeasurementForTests,
  stopDocumentWebMeasurement,
  trackPageView,
  trackPublicCta,
} from ".";

const config = {
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
    [{ ...config, gtmId: "G-invalid" }, false],
    [{ ...config, environment: "local" }, false],
    [{ ...config, environment: "staging" }, false],
    [{ ...config, releaseId: "unknown" }, false],
    [{ ...config, releaseId: "local" }, false],
    [{ ...config, releaseId: "secret/value" }, false],
    [{ ...config, environment: "develop" }, true],
    [{ ...config, environment: "preview" }, true],
    [{ ...config, environment: "production" }, true],
  ] as const)("deploy環境・GTM ID・releaseの設定を検証する", (candidate, expected) => {
    expect(isWebMeasurementRuntimeEnabled(candidate)).toBe(expected);
  });

  it.each([
    ["/", "home"],
    ["/dashboard", "dashboard"],
    ["/staff/person_internal_id", "staff_detail"],
    ["/shifts/submit?token=secret", "capability"],
    ["/line/callback?code=secret&state=secret", "callback"],
    ["/privacy", "legal"],
    ["/unknown", "not_found"],
  ] as const)("同意・認証状態に関係なく%sでGTMと有限page viewを開始する", (pathname, routeFamily) => {
    expect(
      initializeDocumentWebMeasurement({
        config: { ...config, webVitalsSampleRate: 0 },
        currentPathname: pathname,
        initialDocumentPathname: pathname,
        viewportWidth: 1280,
      }),
    ).toBe("initialized");

    expect(document.head.querySelectorAll('script[src*="googletagmanager"]').length).toBe(1);
    expect(window.dataLayer?.filter((event) => event.event === "page_view")).toEqual([
      {
        event: "page_view",
        app_environment: "preview",
        release_id: "release-1",
        route_family: routeFamily,
      },
    ]);
    expect(JSON.stringify(window.dataLayer)).not.toContain("secret");
    expect(JSON.stringify(window.dataLayer)).not.toContain("internal_id");
  });

  it("同じdocumentではGTMと初回page viewを一度だけ開始する", () => {
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
    expect(window.dataLayer?.filter((event) => event.event === "page_view")).toHaveLength(1);
    expect(reportVitals).toHaveBeenCalledTimes(1);
  });

  it("同一pathの重複を止め、SPA遷移先を全routeで送る", () => {
    initializeDocumentWebMeasurement(
      {
        config: { ...config, webVitalsSampleRate: 0 },
        currentPathname: "/articles/first",
        initialDocumentPathname: "/articles/first",
        viewportWidth: 1280,
      },
      { random: () => 0 },
    );

    expect(trackPageView("/articles/first?query=ignored")).toBe(false);
    expect(trackPageView("/dashboard")).toBe(true);
    expect(trackPageView("/staff/person_internal_id")).toBe(true);
    expect(document.head.querySelectorAll('script[src*="googletagmanager"]').length).toBe(1);
    expect(window.dataLayer?.filter((event) => event.event === "page_view")).toEqual([
      expect.objectContaining({ route_family: "article_detail" }),
      expect.objectContaining({ route_family: "dashboard" }),
      expect.objectContaining({ route_family: "staff_detail" }),
    ]);
    expect(JSON.stringify(window.dataLayer)).not.toContain("person_internal_id");
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
        currentPathname: "/dashboard",
        initialDocumentPathname: "/dashboard",
        viewportWidth: 375,
      },
      {
        random: () => 0,
        reportVitals: async (nextReporter) => {
          reporter = nextReporter;
        },
      },
    );
    trackPageView("/staff/person_internal_id");
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
      document_route_family: "dashboard",
      metric_name: "LCP",
      metric_value: 1200,
      metric_rating: "good",
      navigation_type: "navigate",
      release_id: "release-1",
      viewport_class: "mobile",
    });
  });

  it("停止時にruntimeとscriptを停止する", () => {
    initializeDocumentWebMeasurement({
      config: { ...config, webVitalsSampleRate: 0 },
      currentPathname: "/dashboard",
      initialDocumentPathname: "/dashboard",
      viewportWidth: 1280,
    });
    expect(hasActiveWebMeasurement()).toBe(true);

    stopDocumentWebMeasurement();
    expect(hasActiveWebMeasurement()).toBe(false);
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
});
