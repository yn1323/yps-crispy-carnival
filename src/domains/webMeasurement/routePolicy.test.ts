import { describe, expect, it } from "vitest";
import { classifyWebMeasurementRoute, isPublicMeasurementDocument, normalizeMeasurementPathname } from ".";

describe("Web計測route policy", () => {
  it.each([
    ["/", "home"],
    ["/features/", "features"],
    ["/help?from=top", "help_index"],
    ["/help/tasks/staff-management#add-staff-methods", "help_index"],
    ["/help/add-staff/#answer", "help_guide"],
    ["/contact", "contact"],
    ["/articles", "articles_index"],
    ["/articles/shiftori-line-workflow", "article_detail"],
    ["/articles/categories/shift-management", "article_category"],
    ["/demo/flow", "demo_flow"],
    ["/demo/shiftboard", "demo_shiftboard"],
  ] as const)("%sを有限の公開route familyへ写像する", (pathname, routeFamily) => {
    expect(classifyWebMeasurementRoute(pathname)).toEqual({ surface: "measured_public", routeFamily });
  });

  it.each([
    "/account-deletion-accepted",
    "/cache-reset/",
    "/commercial-transactions",
    "/privacy",
    "/privacy/manager",
    "/privacy/staff",
    "/terms",
    "/terms/manager",
    "/terms/staff",
  ])("%sは公開documentだが計測しない", (pathname) => {
    expect(classifyWebMeasurementRoute(pathname)).toEqual({ surface: "public_unmeasured" });
    expect(isPublicMeasurementDocument(pathname)).toBe(true);
  });

  it.each([
    "/dashboard",
    "/login?redirect=/dashboard",
    "/manager-invite?token=secret",
    "/shifts/submit?token=secret",
    "/shifts/view?recruitmentId=secret",
    "/legal/staff/consent?token=secret",
    "/line/callback?code=secret&state=secret",
    "/sso-callback?code=secret&state=secret",
    "/shops/internal-id",
    "/users/internal-id",
    "/shiftboard/internal-id",
    "/pricing",
    "/faq",
    "/howto",
    "/help/a/b",
    "/unknown",
    "/articles/categories/a/b",
  ])("%sはdefault closedにする", (pathname) => {
    expect(classifyWebMeasurementRoute(pathname)).toEqual({ surface: "closed" });
    expect(isPublicMeasurementDocument(pathname)).toBe(false);
  });

  it("query・hash・末尾slashを送信前の分類だけに使えるpathnameへ正規化する", () => {
    expect(normalizeMeasurementPathname("/features///?token=secret#part")).toBe("/features");
  });
});
