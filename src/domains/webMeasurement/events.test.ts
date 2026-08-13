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
  it("page viewはraw URLを持たないexact payloadにする", () => {
    const event = {
      kind: "page_view",
      routeFamily: "article_detail",
      rawUrl: "/articles/private-id?token=secret",
      title: "secret",
    } as const;

    expect(serializeWebMeasurementEvent(event, context)).toEqual({
      event: "page_view",
      app_environment: "preview",
      release_id: "abc123",
      route_family: "article_detail",
    });
  });

  it("CTAは登録済みIDとroute familyだけを送る", () => {
    expect(
      serializeWebMeasurementEvent({ kind: "public_cta", ctaId: "hero_signup", routeFamily: "home" }, context),
    ).toEqual({
      event: "select_content",
      app_environment: "preview",
      content_id: "hero_signup",
      content_type: "public_cta",
      release_id: "abc123",
      route_family: "home",
    });
  });

  it("料金ページのCTAも有限のIDとroute familyだけを送る", () => {
    expect(
      serializeWebMeasurementEvent({ kind: "public_cta", ctaId: "pricing_signup", routeFamily: "pricing" }, context),
    ).toEqual({
      event: "select_content",
      app_environment: "preview",
      content_id: "pricing_signup",
      content_type: "public_cta",
      release_id: "abc123",
      route_family: "pricing",
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
