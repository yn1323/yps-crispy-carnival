import { describe, expect, it } from "vitest";
import {
  buildWebVitalEvent,
  getViewportClass,
  normalizeReleaseId,
  normalizeWebMeasurementEnvironment,
  serializeWebMeasurementEvent,
} from ".";

const context = { environment: "preview", releaseId: "abc123" } as const;

describe("Web計測event serializer", () => {
  it("page viewは集計用URLと利用者の区分だけを持つexact payloadにする", () => {
    const event = {
      kind: "page_view",
      routeFamily: "article_detail",
      pageLocation: "https://shiftori.app/articles/shiftori-line-workflow",
      pageReferrer: "https://shiftori.app/",
      rawUrl: "/articles/private-id?token=secret",
      title: "secret",
    } as const;

    expect(serializeWebMeasurementEvent(event, context)).toEqual({
      event: "page_view",
      app_environment: "preview",
      page_location: "https://shiftori.app/articles/shiftori-line-workflow",
      page_referrer: "https://shiftori.app/",
      release_id: "abc123",
      route_area: "public",
      route_family: "article_detail",
    });
  });

  it("初回page viewは参照元を上書きしない", () => {
    expect(
      serializeWebMeasurementEvent(
        { kind: "page_view", routeFamily: "dashboard", pageLocation: "https://shiftori.app/dashboard" },
        context,
      ),
    ).not.toHaveProperty("page_referrer");
  });

  it("CTAは登録済みIDとroute familyだけを送る", () => {
    expect(
      serializeWebMeasurementEvent(
        { kind: "public_cta", ctaId: "article_cta", routeFamily: "article_detail" },
        context,
      ),
    ).toEqual({
      event: "select_content",
      app_environment: "preview",
      content_id: "article_cta",
      content_type: "public_cta",
      release_id: "abc123",
      route_area: "public",
      route_family: "article_detail",
    });
  });

  it.each([
    {
      name: "setup_complete",
      event: { kind: "setup_complete", setupKind: "first", submissionPattern: "shiftType", routeFamily: "dashboard" },
      expected: { setup_kind: "first", submission_pattern: "shiftType", route_area: "manager" },
    },
    {
      name: "section_view",
      event: { kind: "section_view", section: "pricing", routeFamily: "home" },
      expected: { section: "pricing", route_area: "public" },
    },
    {
      name: "shift_export",
      event: { kind: "shift_export", format: "xlsx", routeFamily: "shift_export" },
      expected: { format: "xlsx", route_area: "manager" },
    },
    {
      name: "help_search",
      event: { kind: "help_search", hasResults: false, routeFamily: "help_index" },
      expected: { has_results: "false", route_area: "public" },
    },
    {
      name: "plan_checkout_start",
      event: { kind: "plan_checkout_start", plan: "pro", routeFamily: "billing" },
      expected: { plan: "pro", route_area: "manager" },
    },
  ] as const)("$nameを有限値だけのexact payloadにする", ({ name, event, expected }) => {
    expect(serializeWebMeasurementEvent(event, context)).toEqual({
      event: name,
      app_environment: "preview",
      release_id: "abc123",
      route_family: event.routeFamily,
      ...expected,
    });
  });

  it("Web Vitalsはdocument routeと低cardinality値だけを送る", () => {
    const event = buildWebVitalEvent(
      { name: "LCP", value: 1234.5, rating: "good", navigationType: "navigate" },
      "home",
      "mobile",
    );
    expect(event).not.toBeNull();
    if (!event) return;

    expect(serializeWebMeasurementEvent(event, context)).toEqual({
      event: "web_vital",
      app_environment: "preview",
      document_route_family: "home",
      metric_name: "LCP",
      metric_value: 1234.5,
      metric_rating: "good",
      navigation_type: "navigate",
      release_id: "abc123",
      viewport_class: "mobile",
    });
  });

  it.each([
    { name: "LCP", value: Number.NaN, rating: "good", navigationType: "navigate" },
    { name: "LCP", value: -1, rating: "good", navigationType: "navigate" },
    { name: "UNKNOWN", value: 1, rating: "good", navigationType: "navigate" },
  ])("不正なmetricを破棄する", (metric) => {
    expect(buildWebVitalEvent(metric as never, "home", "desktop")).toBeNull();
  });

  it("environment・release・viewportを有限値へ正規化する", () => {
    expect(normalizeWebMeasurementEnvironment("production")).toBe("production");
    expect(normalizeWebMeasurementEnvironment("customer-name")).toBe("local");
    expect(normalizeReleaseId(" release_2026-08-12 ")).toBe("release_2026-08-12");
    expect(normalizeReleaseId("secret/value")).toBe("unknown");
    expect(getViewportClass(767)).toBe("mobile");
    expect(getViewportClass(768)).toBe("desktop");
  });
});
