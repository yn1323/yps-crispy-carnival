import { describe, expect, it } from "vitest";
import { getWebMeasurementRouteFamily, normalizeMeasurementPathname } from ".";

describe("Web計測route policy", () => {
  it.each([
    ["/", "home"],
    ["/features/", "features"],
    ["/help?from=top", "help_index"],
    ["/help/tasks/staff-management#add-staff-methods", "help_index"],
    ["/help/basics/notifications", "help_guide"],
    ["/help/add-staff/#answer", "help_guide"],
    ["/contact", "contact"],
    ["/articles", "articles_index"],
    ["/articles/shiftori-line-workflow", "article_detail"],
    ["/articles/categories/shift-management", "article_category"],
    ["/demo/shiftboard", "demo_shiftboard"],
    ["/privacy/manager", "legal"],
    ["/commercial-transactions", "legal"],
    ["/cache-reset", "utility"],
  ] as const)("公開route %sを有限のroute familyへ写像する", (pathname, routeFamily) => {
    expect(getWebMeasurementRouteFamily(pathname)).toBe(routeFamily);
  });

  it.each([
    ["/dashboard", "dashboard"],
    ["/app", "dashboard"],
    ["/account", "account"],
    ["/app/actions", "actions"],
    ["/manage", "organization_management"],
    ["/app/manage/organization", "organization_management"],
    ["/manage/billing", "billing"],
    ["/app/manage/managers/invite-staff", "manager_management"],
    ["/manage/shops/shop_internal_id", "shop_detail"],
    ["/shifts", "shift_management"],
    ["/app/shifts/recruitment_internal_id/board", "shiftboard"],
    ["/shifts/recruitment_internal_id/export", "shift_export"],
    ["/Shifts/recruitment_internal_id/Export", "shift_export"],
    ["/staff", "staff_management"],
    ["/app/staff/order", "staff_management"],
    ["/staff/person_internal_id", "staff_detail"],
    ["/app/staff/person_internal_id/shops/shop_internal_id", "staff_shop"],
  ] as const)("認証後route %sをIDを含まないroute familyへ写像する", (pathname, routeFamily) => {
    expect(getWebMeasurementRouteFamily(pathname)).toBe(routeFamily);
  });

  it.each([
    ["/login?redirect=/dashboard", "auth"],
    ["/forgot-password", "auth"],
    ["/manager-invite?token=secret", "capability"],
    ["/shifts/submit?token=secret", "capability"],
    ["/shifts/view?recruitmentId=secret", "capability"],
    ["/legal/staff/consent?token=secret", "capability"],
    ["/line/callback?code=secret&state=secret", "callback"],
    ["/sso-callback?code=secret&state=secret", "callback"],
  ] as const)("認証前route %sをcredentialを含まないroute familyへ写像する", (pathname, routeFamily) => {
    expect(getWebMeasurementRouteFamily(pathname)).toBe(routeFamily);
  });

  it.each(["/unknown", "/help/a/b", "/articles/categories/a/b"])(
    "未知route %sもnot_foundとして計測対象にする",
    (pathname) => {
      expect(getWebMeasurementRouteFamily(pathname)).toBe("not_found");
    },
  );

  it("query・hash・末尾slashを送信前の分類だけに使えるpathnameへ正規化する", () => {
    expect(normalizeMeasurementPathname("/features///?token=secret#part")).toBe("/features");
  });
});
