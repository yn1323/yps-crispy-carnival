import { describe, expect, it } from "vitest";
import {
  getMeasurementPagePath,
  getWebMeasurementRouteArea,
  getWebMeasurementRouteFamily,
  normalizeMeasurementPathname,
  webMeasurementRouteAreas,
  webMeasurementRouteFamilies,
} from ".";

describe("Web計測route policy", () => {
  it.each([
    ["/", "home"],
    ["/features/", "features"],
    ["/features/shift-request-collection/", "feature_detail"],
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
    ["/signup?redirect=/dashboard", "auth_signup"],
    ["/login?redirect=/dashboard", "auth_login"],
    ["/forgot-password", "auth_password_reset"],
    ["/manager-invite?token=secret", "manager_invite"],
    ["/shifts/submit?token=secret", "staff_submit"],
    ["/shifts/submit/completed", "staff_submit_completed"],
    ["/shifts/view?recruitmentId=secret", "staff_view"],
    ["/shifts/reissue", "staff_reissue"],
    ["/staff/register?token=secret", "staff_register"],
    ["/legal/staff/consent?token=secret", "staff_legal_consent"],
    ["/line/callback?code=secret&state=secret", "callback"],
    ["/sso-callback?code=secret&state=secret", "callback"],
  ] as const)("認証前route %sを用途別のroute familyへ写像する", (pathname, routeFamily) => {
    expect(getWebMeasurementRouteFamily(pathname)).toBe(routeFamily);
  });

  it.each(["/unknown", "/help/a/b", "/articles/categories/a/b"])(
    "未知route %sもnot_foundとして計測対象にする",
    (pathname) => {
      expect(getWebMeasurementRouteFamily(pathname)).toBe("not_found");
    },
  );

  it.each([
    ["home", "public"],
    ["article_detail", "public"],
    ["auth_signup", "auth"],
    ["manager_invite", "auth"],
    ["dashboard", "manager"],
    ["shiftboard", "manager"],
    ["staff_submit", "staff"],
    ["staff_legal_consent", "staff"],
    ["legal", "other"],
    ["callback", "other"],
    ["not_found", "other"],
  ] as const)("route family %sを利用者の区分%sへ分類する", (routeFamily, routeArea) => {
    expect(getWebMeasurementRouteArea(routeFamily)).toBe(routeArea);
  });

  it("すべてのroute familyを定義済みの区分へ分類する", () => {
    for (const routeFamily of webMeasurementRouteFamilies) {
      expect(webMeasurementRouteAreas).toContain(getWebMeasurementRouteArea(routeFamily));
    }
  });

  it.each([
    ["/", "/"],
    ["/articles/shiftori-line-workflow/?utm_source=x#toc", "/articles/shiftori-line-workflow"],
    ["/shifts/submit?token=secret", "/shifts/submit"],
    ["/manage/shops/shop_internal_id", "/manage/shops/:shopId"],
    ["/shifts/recruitment_internal_id/board", "/shifts/:recruitmentId/board"],
    ["/Shifts/recruitment_internal_id/Export", "/shifts/:recruitmentId/export"],
    ["/staff/person_internal_id", "/staff/:personId"],
    ["/staff/order", "/staff/order"],
    ["/staff/register?token=secret", "/staff/register"],
    ["/app/staff/person_internal_id/shops/shop_internal_id", "/app/staff/:personId/shops/:shopId"],
  ] as const)("集計用pathは%sのqueryとIDを除いて%sにする", (pathname, pagePath) => {
    expect(getMeasurementPagePath(pathname)).toBe(pagePath);
  });

  it.each(["/unknown", "/reset/secret-token", "/someone@example.com"])(
    "未知route %sの集計用pathは入力を含まない固定pathにする",
    (pathname) => {
      expect(getMeasurementPagePath(pathname)).toBe("/404");
    },
  );

  it("query・hash・末尾slashを送信前の分類だけに使えるpathnameへ正規化する", () => {
    expect(normalizeMeasurementPathname("/features///?token=secret#part")).toBe("/features");
  });
});
